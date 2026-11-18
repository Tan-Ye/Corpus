import { Router } from 'express';
import { isLLMConfigured, llmStream, type LLMStream } from '@corpus/core';
import type {
    ChatSendRequest,
    Citation,
    Message,
    StreamFrame,
    ToolCall,
    ToolDefinition,
} from '@corpus/core/types';
import { createAccumulator, pipeSSE, streamFrames } from '../utils';
import type { StreamAccumulator } from '../utils';
import { db } from '../db';
import { trimHistory, estimateTokens, MODEL_CONTEXT_TOKENS } from '../context';
import { toolRegistry } from '../mcp';
import { toToolDefinitions } from '../mcp/tools';
import { buildSystemPrompt } from '../prompt';
import {
    buildSearchDocumentsTool,
    runSearchDocuments,
    SEARCH_DOCUMENTS_TOOL,
} from '../retrieval/tool';
import { appendLog, appendMessage, ensureConversation } from '../repository';

const router = Router();

/** 一轮提问最多允许几次工具调用，防止模型反复查同一个东西 */
const MAX_TOOL_ROUNDS = 3;

/** 单条工具结果的上限：MDN 整页文档是几十 KB，不截断会把上下文撑爆 */
const MAX_TOOL_RESULT = 20_000;

// 用于存储每个对话的 AbortController
const conversationIdMap = new Map<string, AbortController>();

interface ChatStreamParams {
    firstStream: LLMStream;
    history: Message[];
    conversationId: string;
    tools: ToolDefinition[];
    controller: AbortController;
    /** 本轮累计的引用：检索工具每执行一次就往里加，最后随回答落库 */
    collected: Citation[];
    /** 需要提前告诉用户的提醒（上下文截断、接近上限等） */
    notices: string[];
    /** 用户中途停止时回调，用来把 stopped 标记写进库 */
    onStopped: () => void;
    onText: (text: string) => void;
}

/**
 * 帧流：第一帧把会话 id 交给前端，然后才是正文。
 *
 * 模型要调工具时：先把它这一轮说的话吐出去，再吐 tool start/end，
 * 把结果塞回 history 后再来一轮。轮数、结果长度都有上限。
 */
async function* chatFrames({
    firstStream,
    history,
    conversationId,
    tools,
    controller,
    collected,
    notices,
    onStopped,
    onText,
}: ChatStreamParams): AsyncGenerator<StreamFrame> {
    yield { type: 'created', conversationId };

    for (const message of notices) {
        yield { type: 'notice', level: 'info', message };
    }

    // 先把参考资料发给前端，正文里的 [n] 才有东西可对
    if (collected.length > 0) {
        yield { type: 'sources', citations: [...collected] };
    }

    let stream: LLMStream = firstStream;
    let produced = '';
    /** 已经跑过"强制作答"那一轮：这一轮不管返回什么都要收尾 */
    let forcedAnswer = false;
    /** 这一轮请求实际带了几条工具（强制作答轮是 0），只给日志用 */
    let givenToolCount = tools.length;

    for (let round = 1; ; round++) {
        const acc = createAccumulator();
        const roundStartedAt = Date.now();

        for await (const frame of streamFrames(stream, acc)) {
            // done 先压住：后面可能还有下一轮，真正的 done 在循环外统一补
            if (frame.type === 'done') {
                continue;
            }

            if (frame.type === 'text') {
                produced += frame.text;
                onText(frame.text);
            }

            yield frame;

            // stopped / error 是终止帧，直接收尾
            if (frame.type === 'stopped' || frame.type === 'error') {
                if (frame.type === 'stopped') {
                    onStopped();
                }
                logRound(conversationId, round, givenToolCount, roundStartedAt, false);
                return;
            }
        }

        logRound(conversationId, round, givenToolCount, roundStartedAt, true);

        const calls = parseToolCalls(acc);

        // 没有工具调用，或者已经在强制作答轮 → 这一轮的正文就是答案
        if (forcedAnswer || calls.length === 0) {
            break;
        }

        history.push({ role: 'assistant', content: acc.text, toolCalls: calls });

        for (const call of calls) {
            yield { type: 'tool', name: call.name, status: 'start' };

            const result = await runTool(call, controller.signal, conversationId, collected.length);
            yield { type: 'tool', name: call.name, status: 'end', ok: result.ok };

            // 检索工具带回的引用立刻下发：正文里的 [n] 指向它们
            if (result.citations && result.citations.length > 0) {
                for (const citation of result.citations) {
                    if (!collected.some((item) => item.id === citation.id)) {
                        collected.push(citation);
                    }
                }

                yield { type: 'sources', citations: [...collected] };
            }

            history.push({ role: 'tool', content: result.text, toolCallId: call.id });
        }

        // 最后一轮工具照常执行，但下一次请求不再给工具：
        // 模型只能拿已有结果作答，用户至少能拿到一个答案，而不是空气泡
        const isLastRound = round === MAX_TOOL_ROUNDS;

        if (isLastRound) {
            console.warn('[chat] 工具调用达到上限，改为强制作答');
        }

        try {
            stream = await llmStream(history, {
                tools: isLastRound ? undefined : tools,
                signal: controller.signal,
            });
            forcedAnswer = isLastRound;
            givenToolCount = isLastRound ? 0 : tools.length;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            appendLog({
                conversationId,
                type: 'error',
                name: '后续请求失败',
                detail: message,
                ok: false,
            });
            yield { type: 'error', message };
            return;
        }
    }

    // 一个字都没吐：当失败处理，前端会删掉空气泡并提示重试
    if (!produced.trim()) {
        appendLog({ conversationId, type: 'error', name: '空回答', ok: false });
        yield { type: 'error', message: '模型没有返回内容，请重试' };
        return;
    }

    yield { type: 'done' };
}

interface ToolOutcome {
    ok: boolean;
    text: string;
    /** 只有本地检索工具会带引用 */
    citations?: Citation[];
}

/** 执行一次工具调用。失败不抛，转成文本回给模型，让它自己决定怎么说 */
async function runTool(
    call: ToolCall,
    signal: AbortSignal,
    conversationId: string,
    citationOffset: number,
): Promise<ToolOutcome> {
    const startedAt = Date.now();

    // 本地文档检索：不是 MCP 插件，直接在当前进程里跑
    if (call.name === SEARCH_DOCUMENTS_TOOL) {
        const query = typeof call.arguments.query === 'string' ? call.arguments.query : '';

        try {
            const outcome = await runSearchDocuments(db, call.arguments, citationOffset);

            appendLog({
                conversationId,
                type: 'retrieval',
                name: '文档检索',
                detail: `q=${query.slice(0, 60)} · hits=${outcome.citations.length}`,
                durationMs: Date.now() - startedAt,
                ok: outcome.ok,
            });

            return {
                ok: outcome.ok,
                text: truncate(outcome.text),
                citations: outcome.citations,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            appendLog({
                conversationId,
                type: 'retrieval',
                name: '文档检索',
                detail: `q=${query.slice(0, 60)} · ${message}`,
                durationMs: Date.now() - startedAt,
                ok: false,
            });

            return { ok: false, text: `文档检索失败：${message}` };
        }
    }

    try {
        const result = await toolRegistry.call(call.name, call.arguments, signal);

        appendLog({
            conversationId,
            type: 'tool',
            name: call.name,
            detail: summarizeArgs(call.arguments),
            durationMs: Date.now() - startedAt,
            ok: !result.isError,
        });

        return { ok: !result.isError, text: truncate(result.text) };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        appendLog({
            conversationId,
            type: 'tool',
            name: call.name,
            detail: summarizeArgs(call.arguments),
            durationMs: Date.now() - startedAt,
            ok: false,
        });

        return { ok: false, text: `工具调用失败：${message}` };
    }
}

/** 工具参数摘要：只留开头一段，日志里不塞完整的检索词/长路径 */
function summarizeArgs(args: Record<string, unknown>): string {
    const text = JSON.stringify(args);

    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/** 一轮 LLM 请求的耗时记录 */
function logRound(
    conversationId: string,
    round: number,
    toolCount: number,
    startedAt: number,
    ok: boolean,
): void {
    appendLog({
        conversationId,
        type: 'llm',
        name: `第 ${round} 轮`,
        detail: `工具 ${toolCount} 个`,
        durationMs: Date.now() - startedAt,
        ok,
    });
}

function truncate(text: string): string {
    if (text.length <= MAX_TOOL_RESULT) {
        return text;
    }

    return `${text.slice(0, MAX_TOOL_RESULT)}\n\n（结果已截断）`;
}

/** 把流式拼起来的分片还原成调用列表；参数不是合法 JSON 时退化成空对象 */
function parseToolCalls(acc: StreamAccumulator): ToolCall[] {
    const entries = [...acc.toolCalls].toSorted((left, right) => left[0] - right[0]);

    return entries.flatMap(([index, entry]) => {
        if (!entry.name) {
            return [];
        }

        let args: Record<string, unknown> = {};

        if (entry.args.trim()) {
            try {
                args = JSON.parse(entry.args) as Record<string, unknown>;
            } catch {
                console.warn(`[chat] 工具参数不是合法 JSON：${entry.args.slice(0, 120)}`);
            }
        }

        return [{ id: entry.id || `call_${index}`, name: entry.name, arguments: args }];
    });
}

/**
 * 发送消息到 LLM，返回一个流，流中包含每个消息的更新
 */
router.post('/send', async (req, res) => {
    // express.json() 没命中时 body 是 undefined（缺 Content-Type，或者中间件没挂到这条路由前面）
    const body = req.body as ChatSendRequest | undefined;
    const messages = body?.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'messages 必须是非空数组' });
        return;
    }

    // 类型只在编译期成立，运行时还是要挡一次
    const invalidAt = messages.findIndex(
        (item) =>
            !item ||
            typeof item.content !== 'string' ||
            (item.role !== 'user' && item.role !== 'assistant' && item.role !== 'system'),
    );
    if (invalidAt !== -1) {
        res.status(400).json({ error: `messages[${invalidAt}] 格式不对` });
        return;
    }

    // 没配置模型就不收消息：既不落库，也不调用上游。
    // 这个检查要放在写库之前，否则用户会看到一堆发不出去的「提问」。
    if (!isLLMConfigured()) {
        res.status(400).json({
            error: '还没有配置模型：先在设置里填写服务地址、模型名和 API Key',
        });
        return;
    }

    // 新会话由服务端生成 id；前端传了就用前端的（老会话追加消息）
    const conversationId = body?.conversationId ?? crypto.randomUUID();

    // 会话和用户消息先落库：这样即使上游失败，这条提问也不会丢
    ensureConversation(conversationId, messages[0]?.content.slice(0, 20) ?? '新对话');
    appendMessage({
        id: crypto.randomUUID(),
        conversationId,
        role: 'user',
        content: messages.at(-1)?.content ?? '',
    });

    // 本地检索是「按需工具」：开开关且有文档时，把 search_documents 和 MCP 工具一起交给模型，
    // 由模型根据文档用途描述决定查不查——不再无条件注入，避免把无关文档带进答案。
    const tools = toToolDefinitions();

    if (body?.useRetrieval) {
        const searchTool = buildSearchDocumentsTool(db);

        if (searchTool) {
            tools.push(searchTool);
        }
    }

    /** 本轮检索工具带回的引用：边跑边累计，最后随回答落库 */
    const collected: Citation[] = [];

    // 系统提示词：基础文案来自 prompts/chat-system.md，
    // 每个插件「什么时候用我」来自它自己的 manifest
    const historyContext = trimHistory(messages);
    const systemPrompt = buildSystemPrompt({
        hints: toolRegistry.hints(),
        historyTrimmed: historyContext.trimmed,
    });
    const history: Message[] = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...historyContext.messages]
        : [...historyContext.messages];

    // 提前告诉用户上下文状况：等上游报 400 就晚了
    const notices: string[] = [];

    if (historyContext.trimmed) {
        notices.push(
            `对话较长，已省略最早的 ${historyContext.droppedMessages} 条消息。` +
                '如果这轮追问依赖更早的内容，建议新开会话，或先生成一份交接摘要。',
        );
    }

    const promptTokens = estimateTokens(systemPrompt) + historyContext.estimatedTokens;
    const contextRatio = promptTokens / MODEL_CONTEXT_TOKENS;

    if (contextRatio >= 0.9) {
        notices.push(
            `本轮上下文约 ${promptTokens} token，已达到模型上限的 ${Math.round(contextRatio * 100)}%，很可能失败。` +
                '建议新开会话，并把交接摘要作为第一条消息发过去。',
        );
    } else if (contextRatio >= 0.6) {
        notices.push(
            `本轮上下文约 ${promptTokens} token，用掉了一半以上。对话继续变长就需要新开会话。`,
        );
    }

    // 这一刻还没写 SSE 头，上游失败可以正常回一个 HTTP 错误
    let stream: LLMStream;
    try {
        stream = await llmStream(history, { tools });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[chat] 上游调用失败:', message);
        appendLog({
            conversationId,
            type: 'error',
            name: '上游调用失败',
            detail: message,
            ok: false,
        });
        res.status(502).json({ error: message });
        return;
    }

    // 后续几轮复用同一个 controller：/stop 一按，所有请求和工具调用一起中断
    const controller = stream.controller;
    conversationIdMap.set(conversationId, controller);

    let answer = '';
    let stopped = false;

    try {
        await pipeSSE(
            res,
            chatFrames({
                firstStream: stream,
                history,
                conversationId,
                tools,
                controller,
                collected,
                notices,
                onStopped: () => {
                    stopped = true;
                },
                onText: (text) => {
                    answer += text;
                },
            }),
            {
                abort: () => controller.abort(),
                isAborted: () => controller.signal.aborted,
            },
        );
    } finally {
        // 成功、失败、被停止都要清掉，否则 Map 会一直涨
        conversationIdMap.delete(conversationId);

        // 只在结束时写一次：流式期间不碰数据库
        if (answer) {
            appendMessage({
                id: crypto.randomUUID(),
                conversationId,
                role: 'assistant',
                content: answer,
                // 引用随消息落库：刷新后历史里还能看到出处
                citations: collected,
                // 被用户停掉的回答要留个标记，历史里才看得出来不完整
                stopped,
            });
        }
    }
});

router.post('/stop/:conversationId', (req, res) => {
    const { conversationId } = req.params;
    const controller = conversationIdMap.get(conversationId);

    if (controller) {
        controller.abort();
        conversationIdMap.delete(conversationId);
    }

    // 幂等：这一条已经跑完或者压根不存在，也回 204，前端不用区分
    res.status(204).end();
});

export default router;
