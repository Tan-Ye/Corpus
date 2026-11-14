import type { LLMStream } from '@corpus/core';
import type { StreamFrame } from '@corpus/core/types';

/**
 * 把 SDK 的 chunk 流转成 SSE 帧。
 * 正常读完补 done；被中断补 stopped。
 *
 * 注意：中断时 SDK 不一定抛错——它可能只是结束迭代。
 * 所以循环退出后要再判一次 signal，不能只靠 catch。
 * 首包和末包通常是空 delta，直接跳过。
 */
export async function* streamFrames(stream: LLMStream): AsyncGenerator<StreamFrame> {
    try {
        for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) yield { type: 'text', text };
        }
    } catch (error) {
        // 中断时抛错的情况
        if (stream.controller.signal.aborted) {
            yield { type: 'stopped' };
            return;
        }
        throw error;
    }

    // 中断时正常结束迭代的情况
    if (stream.controller.signal.aborted) {
        yield { type: 'stopped' };
        return;
    }

    yield { type: 'done' };
}
