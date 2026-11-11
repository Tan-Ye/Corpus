export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface LLMConfig {
    baseUrl: string;
    model: string;
    apiKey: string;
}
