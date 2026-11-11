import { Router } from "express";
import { llmStream } from "@corpus/core";
import type { Message, LLMStream } from "@corpus/core";
import { pipeSSE, streamText } from "../utils";

const router = Router();

const TEST_MESSAGES: Message[] = [
    {
        role: 'user',
        content: '随意输出一段100字以内的文本,什么都可以，用于测试连通性',
    },
]

router.get('/', async (req, res) => {
    let stream: LLMStream;
    try {
        stream = await llmStream(TEST_MESSAGES);
    } catch (error) {
        // 此刻还没写 SSE 头，可以正常回一个 HTTP 错误
        const message = error instanceof Error ? error.message : String(error);
        console.error('[chat-readyz] 上游调用失败:', message);
        res.status(502).json({ error: message });
        return;
    }

    await pipeSSE(res, streamText(stream), {
        abort: () => stream.controller.abort(),
        isAborted: () => stream.controller.signal.aborted,
    });
});

export {
    router,
}
