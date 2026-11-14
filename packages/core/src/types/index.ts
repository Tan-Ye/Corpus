export * from './chat';
export * from './conversation';

export interface LLMConfig {
    baseUrl: string;
    model: string;
    apiKey: string;
}
