import OpenAI from 'openai';
import type { Stream } from 'openai/streaming';
import type { Message, LLMConfig } from './types';

// SDK 相关的类型留在这里，types.ts 只放契约，不依赖具体 SDK
export type ChatCompletionChunk = OpenAI.Chat.Completions.ChatCompletionChunk;
export type LLMStream = Stream<ChatCompletionChunk>;

let openai: OpenAI | null = null;
let model: string | null = null;

/**
 * 开始一轮对话，返回一个流，流中包含每个消息的更新
 */
export async function llmStream(messages: Message[]): Promise<LLMStream> {
    if (!openai || !model) {
        throw new Error('LLM 未初始化：服务启动时应先调用 initLLMConfig');
    }

    return openai.chat.completions.create({
        messages,
        model,
        stream: true,
    });
}

// 初始化LLMConfig
export function initLLMConfig(config: LLMConfig) {
    const missing = [
        !config.baseUrl && 'LLM_BASE_URL',
        !config.model && 'LLM_MODEL',
        !config.apiKey && 'LLM_API_KEY',
    ].filter((name): name is string => Boolean(name));

    if (missing.length > 0) {
        throw new Error(`缺少环境变量：${missing.join(' / ')}（参考 .env.example）`);
    }

    openai = new OpenAI({
        baseURL: config.baseUrl,
        apiKey: config.apiKey,
    });
    model = config.model;
}

// 修改LLMConfig
export function setLLMConfig(config: LLMConfig) {
    initLLMConfig(config);
}
