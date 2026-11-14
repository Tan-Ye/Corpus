import type { Response } from 'express';
import type { StreamFrame } from '@corpus/core/types';

export interface SSEStreamOptions {
    /** 客户端断开时调用，用来取消上游请求 */
    abort: () => void;
    /** 判断是不是主动中断：主动中断不记错误 */
    isAborted: () => boolean;
}

// 已经断开的响应写进去是静默丢弃，但还是别浪费这个调用
function writeFrame(res: Response, frame: StreamFrame): void {
    if (res.writableEnded || res.destroyed) return;
    res.write(`data: ${JSON.stringify(frame)}\n\n`);
}

/**
 * 把一段 SSE 帧流转成响应：写头、逐帧发、收尾。
 *
 * 发什么帧由调用方决定（created / text / done / stopped / error），
 * 这里只负责两件事：连接断了 → 取消上游；意外的异常 → 补一帧 error。
 */
export async function pipeSSE(
    res: Response,
    frames: AsyncIterable<StreamFrame>,
    options: SSEStreamOptions,
): Promise<void> {
    const { abort, isAborted } = options;

    // 必须在写任何东西之前挂上：点停止 / 关页面 → 取消上游
    res.on('close', () => {
        if (!res.writableEnded) abort();
    });

    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });

    try {
        for await (const frame of frames) {
            writeFrame(res, frame);
        }
    } catch (error) {
        // 用户自己点的停止，不是错误：帧流里已经发过 stopped 了，这里直接收尾
        if (isAborted()) return;

        const message = error instanceof Error ? error.message : String(error);
        console.error('[sse] 上游流中断:', message);
        writeFrame(res, { type: 'error', message });
    } finally {
        if (!res.writableEnded && !res.destroyed) res.end();
    }
}
