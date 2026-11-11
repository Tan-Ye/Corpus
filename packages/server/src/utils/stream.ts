import type { LLMStream } from "@corpus/core";

/**
 * 把 SDK 的流拆成纯文本块。首包和末包通常是空 delta，直接丢掉。
 */
export async function* streamText(stream: LLMStream): AsyncGenerator<string> {
    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) yield content;
    }
}
