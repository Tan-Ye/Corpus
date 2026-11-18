export * from './chat';
export * from './conversation';
export * from './docs';

export interface LLMConfig {
    baseUrl: string;
    model: string;
    apiKey: string;
}
