import { apiUrl, del, get, patch, post } from '@/utils/request';

export interface DocumentRow {
    id: string;
    title: string;
    /** 用途描述：模型据此判断什么问题该查这篇，空着就只按标题判断 */
    description: string | null;
    /** 展示用来源：原文件名 / 手动输入 */
    source: string | null;
    /** 源文件绝对路径，手动输入的文档为 null */
    sourcePath: string | null;
    /** 解析产物 markdown 的绝对路径 */
    markdownPath: string | null;
    createdAt: number;
    chunkCount: number;
}

export interface ChunkView {
    documentId: string;
    documentTitle: string;
    headingPath: string[];
    startLine: number;
    endLine: number;
    text: string;
}

export interface HitView {
    chunk: ChunkView;
    score: number;
    keywordScore: number;
    vectorScore: number;
}

export interface SearchResult {
    hits: HitView[];
    /** 最高分低于阈值：资料里没有 */
    belowThreshold: boolean;
}

export interface UploadResult {
    documentId: string;
    headingCount: number;
    chunkCount: number;
    format: 'markdown' | 'text' | 'docx' | 'pdf';
    /** 内容已经在库里，本次没有重复入库 */
    deduplicated?: boolean;
    sourcePath?: string;
    markdownPath?: string;
}

export interface ReindexResult {
    rebuilt: number;
    skipped: { documentId: string; title: string; reason: string }[];
}

export interface DocumentContent {
    documentId: string;
    title: string;
    source: string | null;
    totalLines: number;
    startLine: number;
    endLine: number;
    lines: string[];
    /** 服务端返回的片段可能被截到文件边界 */
}

/** 打开原文：只取需要的那几行，引用定位用 */
export function getDocumentContent(
    id: string,
    start: number,
    end: number,
): Promise<DocumentContent> {
    const params = new URLSearchParams({ start: String(start), end: String(end) });

    return get<DocumentContent>(`/documents/${id}/content?${params.toString()}`);
}

/** 上传限制：与服务端保持一致 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = ['.md', '.markdown', '.txt', '.docx', '.pdf'];

export function listDocuments(): Promise<DocumentRow[]> {
    return get<DocumentRow[]>('/documents');
}

/**
 * 上传文件：用 XHR 而不是 fetch，因为要拿上传进度（fetch 不给 upload progress）。
 * 原件和解析产物都由服务端落盘。
 */
export function uploadDocument(
    file: File,
    onProgress?: (percent: number) => void,
    description?: string,
): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const params = new URLSearchParams({ filename: file.name });

        if (description?.trim()) {
            params.set('description', description.trim());
        }

        xhr.open('POST', apiUrl(`/documents/upload?${params.toString()}`));
        xhr.setRequestHeader('content-type', 'application/octet-stream');

        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                onProgress?.(Math.round((event.loaded / event.total) * 100));
            }
        });

        xhr.addEventListener('load', () => {
            let body: unknown;

            try {
                body = JSON.parse(xhr.responseText);
            } catch {
                body = undefined;
            }

            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(body as UploadResult);
                return;
            }

            const message = (body as { error?: string } | undefined)?.error;
            reject(new Error(message ?? `上传失败（${xhr.status}）`));
        });

        xhr.addEventListener('error', () => reject(new Error('连不上服务端')));
        xhr.addEventListener('abort', () => reject(new Error('上传已取消')));

        xhr.send(file);
    });
}

export function searchDocuments(query: string, limit = 5): Promise<SearchResult> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });

    return get<SearchResult>(`/documents/search?${params.toString()}`);
}

/** 删除文档；purgeFiles 为 true 时连磁盘上的源文件和 markdown 一起删 */
export function deleteDocument(
    id: string,
    purgeFiles = false,
): Promise<{ removed: boolean; removedFiles: string[] }> {
    return del<{ removed: boolean; removedFiles: string[] }>(
        `/documents/${id}?purgeFiles=${purgeFiles ? '1' : '0'}`,
    );
}

export interface DocumentUpdateResult {
    id: string;
    title: string;
    description: string | null;
}

/**
 * 更新文档属性。
 * 标题会同步到引用和全文索引；用途描述只给模型看，不影响检索命中。
 */
export function updateDocument(
    id: string,
    update: { title?: string; description?: string },
): Promise<DocumentUpdateResult> {
    return patch<DocumentUpdateResult>(`/documents/${id}`, update);
}

/** 重建索引：按磁盘上的 markdown 重新切块，不动文档记录 */
export function reindexDocuments(): Promise<ReindexResult> {
    return post<ReindexResult>('/documents/reindex', undefined, { timeout: 120_000 });
}
