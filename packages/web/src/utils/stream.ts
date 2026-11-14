import type { StreamFrame } from '@corpus/core/types';

/**
 * 从缓冲区里取出所有完整帧（以空行分隔），剩下的半帧原样返回。
 * 一次 read 可能拿到半帧、一帧或好几帧，所以完整的要一次抽干，只留残帧等下一个 chunk。
 */
function takeFrames(buffer: string): { frames: string[]; rest: string } {
    const frames: string[] = [];
    let rest = buffer;
    let boundary = rest.indexOf('\n\n');

    while (boundary !== -1) {
        frames.push(rest.slice(0, boundary));
        rest = rest.slice(boundary + 2);
        boundary = rest.indexOf('\n\n');
    }

    return { frames, rest };
}

/**
 * 把一帧原始文本解析成帧对象。
 * 一帧里可能有多行（data: 之外还有 event: / id:），只认 data: 开头的行。
 * 不是认识的形状就返回 null，由调用方跳过。
 */
function parseFrame(rawFrame: string): StreamFrame | null {
    const payload = rawFrame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');

    if (!payload || payload === '[DONE]') {
        return null;
    }

    try {
        const parsed = JSON.parse(payload) as { type?: unknown };

        if (typeof parsed.type !== 'string') {
            console.error('[sse] 帧缺少 type 字段', rawFrame);
            return null;
        }

        return parsed as StreamFrame;
    } catch (error) {
        console.error('[sse] 解析帧失败', error, rawFrame);
        return null;
    }
}

/**
 * 读 SSE 响应体，逐个吐出帧对象。
 * 网络分块是任意的（半帧、一帧、多帧都可能），这里负责拼回完整帧。
 */
export async function* streamParserRead(
    body: ReadableStream<Uint8Array> | null,
): AsyncGenerator<StreamFrame> {
    if (!body) {
        throw new Error('响应没有可读的 body');
    }

    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
        let finished = false;

        do {
            const { done, value } = await reader.read();
            finished = done;

            if (value) {
                buffer += decoder.decode(value, { stream: true });
            }

            const { frames, rest } = takeFrames(buffer);
            buffer = rest;

            for (const rawFrame of frames) {
                if (!rawFrame.trim()) {
                    continue;
                }
                const frame = parseFrame(rawFrame);
                if (frame) {
                    yield frame;
                }
            }
        } while (!finished);

        // 流结束时如果还剩内容，说明服务端没补空行，也当一帧处理
        if (buffer.trim()) {
            const frame = parseFrame(buffer);
            if (frame) {
                yield frame;
            }
        }
    } finally {
        await reader.cancel().catch(() => {});
    }
}
