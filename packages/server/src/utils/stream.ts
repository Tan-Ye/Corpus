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
export async function* streamFrames(
    stream: LLMStream,
    acc: StreamAccumulator = createAccumulator(),
): AsyncGenerator<StreamFrame> {
    try {
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta || {};
            if (delta?.content) {
                acc.text += delta.content;
                yield { type: 'text', text: delta.content };
            }
            for (const part of delta?.tool_calls ?? []) {
                const entry = acc.toolCalls.get(part.index) ?? { id: '', name: '', args: '' };
                if (part.id) entry.id = part.id;
                if (part.function?.name) entry.name = part.function.name;
                if (part.function?.arguments) entry.args += part.function.arguments; // 拼接
                acc.toolCalls.set(part.index, entry);
            }
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

export interface StreamAccumulator {
    text: string;
    toolCalls: Map<number, { id: string; name: string; args: string }>;
}

export function createAccumulator(): StreamAccumulator {
    return {
        text: '',
        toolCalls: new Map(),
    };
}
