import { Router } from 'express';
import { llmStream, type LLMStream } from '@corpus/core';
import type {
    ChatSendRequest,
    Message,
    StreamFrame,
    ToolCall,
    ToolDefinition,
} from '@corpus/core/types';
import { createAccumulator, pipeSSE, streamFrames } from '../utils';
import type { StreamAccumulator } from '../utils';
import { toolRegistry } from '../mcp';
import { toToolDefinitions } from '../mcp/tools';
import { buildSystemPrompt } from '../prompt';
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
    onText,
}: ChatStreamParams): AsyncGenerator<StreamFrame> {
    yield { type: 'created', conversationId };

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

            const result = await runTool(call, controller.signal, conversationId);
            yield { type: 'tool', name: call.name, status: 'end', ok: result.ok };

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

/** 执行一次工具调用。失败不抛，转成文本回给模型，让它自己决定怎么说 */
async function runTool(
    call: ToolCall,
    signal: AbortSignal,
    conversationId: string,
): Promise<{ ok: boolean; text: string }> {
    const startedAt = Date.now();

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

    const tools = toToolDefinitions();

    // 系统提示词：基础文案来自 prompts/chat-system.md，
    // 每个插件「什么时候用我」来自它自己的 manifest
    const systemPrompt = buildSystemPrompt(toolRegistry.hints());
    const history: Message[] = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : [...messages];

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

    try {
        await pipeSSE(
            res,
            chatFrames({
                firstStream: stream,
                history,
                conversationId,
                tools,
                controller,
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
