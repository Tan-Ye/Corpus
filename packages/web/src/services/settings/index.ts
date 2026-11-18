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

/** 桌面壳（Electron）经 preload 暴露的只读能力；浏览器里没有这个对象 */
export interface AppInfo {
    version: string;
    isDev: boolean;
    platform: string;
}

export interface UpdateCheckResult {
    /** update = 有新版本；latest = 已是最新；error = 查不了 */
    status: 'update' | 'latest' | 'error';
    current: string;
    latest?: string;
    url?: string;
    notes?: string;
    error?: string;
}

interface CorpusShellBridge {
    getAppInfo: () => Promise<AppInfo>;
    checkUpdate: () => Promise<UpdateCheckResult>;
}

declare global {
    interface Window {
        corpusShell?: CorpusShellBridge;
    }
}

/** 浏览器里打开（Vite dev 或直接访问网页）时返回 null，界面据此显示「仅桌面版」 */
export function getDesktopBridge(): CorpusShellBridge | null {
    return window.corpusShell ?? null;
}
