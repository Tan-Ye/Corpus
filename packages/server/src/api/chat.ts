import { Router } from 'express';
import { llmStream, type LLMStream } from '@corpus/core';
import type { ChatSendRequest, StreamFrame } from '@corpus/core/types';
import { pipeSSE, streamFrames } from '../utils';
import { appendMessage, ensureConversation } from '../repository';

const router = Router();

// 用于存储每个对话的 AbortController
const conversationIdMap = new Map<string, AbortController>();

/**
 * 帧流：第一帧把会话 id 交给前端，然后才是正文。
 * 正文顺手回调给调用方，流结束后整段落库。
 */
async function* chatFrames(
    stream: LLMStream,
    conversationId: string,
    onText: (text: string) => void,
): AsyncGenerator<StreamFrame> {
    yield { type: 'created', conversationId };

    for await (const frame of streamFrames(stream)) {
        if (frame.type === 'text') {
            onText(frame.text);
        }
        yield frame;
    }
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

    // 这一刻还没写 SSE 头，上游失败可以正常回一个 HTTP 错误
    let stream: LLMStream;
    try {
        stream = await llmStream(messages);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[chat] 上游调用失败:', message);
        res.status(502).json({ error: message });
        return;
    }

    conversationIdMap.set(conversationId, stream.controller);

    let answer = '';

    try {
        await pipeSSE(
            res,
            chatFrames(stream, conversationId, (text) => {
                answer += text;
            }),
            {
                abort: () => stream.controller.abort(),
                isAborted: () => stream.controller.signal.aborted,
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
