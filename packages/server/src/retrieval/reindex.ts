import { readFile } from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';

import { chunkDocument, parseMarkdown } from '@corpus/core';
import type { Embedder } from '@corpus/core';

import { KEYWORD_ONLY_MODEL } from './embedder';
import { deleteChunksOfDocument, insertChunks, listDocuments } from './store';

export interface ReindexResult {
    rebuilt: number;
    skipped: { documentId: string; title: string; reason: string }[];
}

/**
 * 重建索引：不动 documents 行，只按磁盘上的 markdown 重新解析、分块、写 chunks。
 *
 * 用途：改了分块参数、或者以后换了 embedding 模型，都要重跑一遍。
 * 没有 markdown 文件的文档（比如没配存储位置时粘贴入库的）跳过并报告原因。
 */
export async function reindexDocuments(
    db: DatabaseSync,
    embedder: Embedder | null = null,
): Promise<ReindexResult> {
    const result: ReindexResult = { rebuilt: 0, skipped: [] };

    for (const document of listDocuments(db)) {
        if (!document.markdownPath) {
            result.skipped.push({
                documentId: document.id,
                title: document.title,
                reason: '没有 markdown 文件',
            });
            continue;
        }

        let markdown: string;

        try {
            markdown = await readFile(document.markdownPath, 'utf8');
        } catch {
            result.skipped.push({
                documentId: document.id,
                title: document.title,
                reason: 'markdown 文件读不到',
            });
            continue;
        }

        const source = {
            id: document.id,
            title: document.title,
            path: document.sourcePath ?? undefined,
            text: markdown,
        };

        const chunks = chunkDocument(source, parseMarkdown(source));

        if (chunks.length === 0) {
            result.skipped.push({
                documentId: document.id,
                title: document.title,
                reason: '没有可索引的正文',
            });
            continue;
        }

        const vectors = embedder ? await embedder.embed(chunks.map((chunk) => chunk.text)) : [];
        const model = embedder
            ? { name: embedder.name, dim: embedder.dim }
            : { name: KEYWORD_ONLY_MODEL, dim: 0 };

        // 先算好再替换：中途失败不会把文档变成「没有索引」的半吊子状态
        db.exec('BEGIN');

        try {
            deleteChunksOfDocument(db, document.id);
            insertChunks(db, chunks, vectors, model);
            db.exec('COMMIT');
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }

        result.rebuilt += 1;
    }

    return result;
}
