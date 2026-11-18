import OpenAI from 'openai';
import type { Stream } from 'openai/streaming';
import type { Message, LLMConfig, ToolDefinition } from './types';

// SDK 相关的类型留在这里，types.ts 只放契约，不依赖具体 SDK
export type ChatCompletionChunk = OpenAI.Chat.Completions.ChatCompletionChunk;
export type LLMStream = Stream<ChatCompletionChunk>;

let openai: OpenAI | null = null;
let model: string | null = null;

type ChatMessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatTool = OpenAI.Chat.Completions.ChatCompletionTool;

function toChatMessages(messages: Message[]): ChatMessageParam[] {
    return messages.map((message) => {
        switch (message.role) {
            case 'system':
                return { role: 'system', content: message.content };

            case 'user':
                return { role: 'user', content: message.content };

            case 'tool':
                return {
                    role: 'tool',
                    content: message.content,
                    tool_call_id: message.toolCallId ?? '',
                };

            case 'assistant':
                if (!message.toolCalls?.length) {
                    return { role: 'assistant', content: message.content };
                }
                return {
                    role: 'assistant',
                    content: message.content || null,
                    tool_calls: message.toolCalls.map((call) => ({
                        id: call.id,
                        type: 'function' as const,
                        function: {
                            name: call.name,
                            arguments: JSON.stringify(call.arguments),
                        },
                    })),
                };
        }
    });
}

function toChatTools(tools: ToolDefinition[]): ChatTool[] {
    return tools.map((tool) => ({
        type: 'function' as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters as Record<string, unknown>,
        },
    }));
}

/** 这些状态码代表「过一会儿再试可能就好了」，别的 4xx 重试也没用 */
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

const MAX_ATTEMPTS = 3;

const RETRY_BASE_DELAY_MS = 500;

function isRetryable(error: unknown): boolean {
    const status = (error as { status?: number } | null)?.status;

    if (typeof status === 'number') {
        return RETRYABLE_STATUS.has(status);
    }

    const name = (error as { name?: string } | null)?.name;

    return name === 'APIConnectionError' || name === 'APITimeoutError';
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

/**
 * 开始一轮对话，返回一个流，流中包含每个消息的更新。
 *
 * 只在「还没开始吐字」时重试：一旦流已经产出内容，重试会导致重复输出，
 * 那种情况交给上层（用户点重试）处理。
 */
export async function llmStream(
    messages: Message[],
    options: {
        tools?: ToolDefinition[];
        signal?: AbortSignal;
    } = {},
): Promise<LLMStream> {
    if (!openai || !model) {
        throw new Error('LLM 未初始化：服务启动时应先调用 initLLMConfig');
    }
    const { tools, signal } = options;

    for (let attempt = 1; ; attempt += 1) {
        try {
            return await openai.chat.completions.create(
                {
                    messages: toChatMessages(messages),
                    model,
                    stream: true,
                    ...(tools?.length
                        ? { tools: toChatTools(tools), tool_choice: 'auto' as const }
                        : {}),
                },
                { signal },
            );
        } catch (error) {
            const canRetry = attempt < MAX_ATTEMPTS && !signal?.aborted && isRetryable(error);

            if (!canRetry) {
                throw error;
            }

            const wait = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
            console.warn(`[llm] 第 ${attempt} 次请求失败，${wait}ms 后重试`, error);
            await delay(wait);
        }
    }
}

/** 是否已经配置过模型：没配置时调用方应该直接拒绝，而不是等 llmStream 抛错 */
export function isLLMConfigured(): boolean {
    return openai !== null && model !== null;
}

/** 当前模型名（前端顶栏显示用）；没配置时返回 null */
export function getLLMModel(): string | null {
    return model;
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
