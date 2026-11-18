import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { chunkDocument, parseMarkdown } from '@corpus/core';
import type { Embedder } from '@corpus/core';

import { KEYWORD_ONLY_MODEL } from './embedder';
import { findDocumentByHash, insertDocument } from './store';

export interface IngestInput {
    title: string;
    /** 用途描述：模型据此判断「什么时候该查这篇文档」 */
    description?: string;
    /** 已经解析成 Markdown 的正文 */
    text: string;
    /** 展示用来源：原文件名、URL、手动输入 */
    source?: string;
    /** 源文件绝对路径 */
    sourcePath?: string;
    /** 解析产物（markdown）绝对路径 */
    markdownPath?: string;
    /** 调用方已经生成了 id 时传入，保证磁盘文件名和库记录一致 */
    documentId?: string;
}

export interface IngestResult {
    documentId: string;
    /** 切出多少节（按标题）；重复文档返回 0 */
    headingCount: number;
    /** 写入多少块；重复文档返回已有块数 */
    chunkCount: number;
    /** 内容已存在，本次没有重复入库 */
    deduplicated: boolean;
}

/**
 * 内容哈希：先归一换行和首尾空白，
 * 同一份内容在不同平台（CRLF/LF）上传不应该被当成两篇。
 */
export function hashMarkdown(markdown: string): string {
    const normalized = markdown.replace(/\r\n?/g, '\n').trim();

    return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * 入库：解析 → 分块 → 向量化 → 写库。
 *
 * 先按内容哈希去重：同一份内容只入库一次，重复上传直接返回已有文档。
 * embedder 为 null 时（当前默认）不生成向量，只写关键词索引。
 */
export async function ingestDocument(
    db: DatabaseSync,
    input: IngestInput,
    embedder: Embedder | null = null,
): Promise<IngestResult> {
    const contentHash = hashMarkdown(input.text);
    const existing = findDocumentByHash(db, contentHash);

    if (existing) {
        return {
            documentId: existing.id,
            headingCount: 0,
            chunkCount: existing.chunkCount,
            deduplicated: true,
        };
    }

    const document = {
        id: input.documentId ?? crypto.randomUUID(),
        title: input.title.trim() || '未命名文档',
        path: input.sourcePath,
        text: input.text,
    };

    const sections = parseMarkdown(document);
    const chunks = chunkDocument(document, sections);

    if (chunks.length === 0) {
        throw new Error('文档里没有可索引的正文');
    }

    const vectors = embedder ? await embedder.embed(chunks.map((chunk) => chunk.text)) : [];
    const model = embedder
        ? { name: embedder.name, dim: embedder.dim }
        : { name: KEYWORD_ONLY_MODEL, dim: 0 };

    insertDocument(
        db,
        {
            id: document.id,
            title: document.title,
            description: input.description,
            source: input.source,
            sourcePath: input.sourcePath,
            markdownPath: input.markdownPath,
            contentHash,
        },
        chunks,
        vectors,
        model,
    );

    return {
        documentId: document.id,
        headingCount: sections.length,
        chunkCount: chunks.length,
        deduplicated: false,
    };
}
