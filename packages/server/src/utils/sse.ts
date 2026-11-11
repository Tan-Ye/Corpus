import type { Response } from "express";

export interface SSEStreamOptions {
    /** 客户端断开时调用，用来取消上游请求 */
    abort: () => void;
    /** 判断是不是主动中断：主动中断不记错误、不发 error 帧 */
    isAborted: () => boolean;
}

// 已经断开的响应写进去是静默丢弃，但还是别浪费这个调用
function writeEvent(res: Response, payload: unknown): void {
    if (res.writableEnded || res.destroyed) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * 把一段文本流写成 SSE 响应：写头、逐块发、收尾、判断中断。
 * 帧格式统一成 JSON：{ text } / { done } / { error }。
 */
export async function pipeSSE(
    res: Response,
    source: AsyncIterable<string>,
    options: SSEStreamOptions,
): Promise<void> {
    const { abort, isAborted } = options;

    // 必须在写任何东西之前挂上：点停止 / 关页面 → 取消上游
    res.on("close", () => {
        if (!res.writableEnded) abort();
    });

    res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
    });

    try {
        for await (const text of source) {
            writeEvent(res, { text });
        }
        writeEvent(res, { done: true });
    } catch (error) {
        // 用户自己点的停止，不是错误：静默收尾
        if (isAborted()) return;

        const message = error instanceof Error ? error.message : String(error);
        console.error("[sse] 上游流中断:", message);
        writeEvent(res, { error: message });
    } finally {
        if (!res.writableEnded && !res.destroyed) res.end();
    }
}
