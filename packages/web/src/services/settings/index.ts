import { get, put } from '@/utils/request';

export interface DocumentStorageSetting {
    /** null = 还没设置过，前端据此禁止上传 */
    storagePath: string | null;
}

export interface StorageMigrationResult {
    movedDocuments: number;
    movedFiles: number;
    missing: string[];
}

export interface SaveStorageResult extends DocumentStorageSetting {
    migration: StorageMigrationResult | null;
}

export function getDocumentStorage(): Promise<DocumentStorageSetting> {
    return get<DocumentStorageSetting>('/settings/documents');
}

/** 保存存储位置；migrate 为 true 时把旧目录里的文件搬到新目录 */
export function saveDocumentStorage(
    storagePath: string,
    migrate = false,
): Promise<SaveStorageResult> {
    return put<SaveStorageResult>('/settings/documents', { storagePath, migrate });
}

/** 模型配置：apiKey 永不下发，只有 hasApiKey */
export interface LLMConfigView {
    configured: boolean;
    /** user = 界面里填的；env = 开发环境的 .env；none = 都没有 */
    source: 'user' | 'env' | 'none';
    baseUrl: string;
    model: string;
    hasApiKey: boolean;
}

export interface LLMConfigInput {
    baseUrl: string;
    model: string;
    /** 留空表示沿用已保存的 key */
    apiKey?: string;
}

export function getLLMConfig(): Promise<LLMConfigView> {
    return get<LLMConfigView>('/settings/llm');
}

export function saveLLMConfig(input: LLMConfigInput): Promise<LLMConfigView> {
    return put<LLMConfigView>('/settings/llm', input);
}
