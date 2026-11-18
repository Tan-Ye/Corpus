import type { DatabaseSync } from 'node:sqlite';

import { tokenize } from '@corpus/core';
import type { Embedder, TextChunk } from '@corpus/core';

export interface DocumentRow {
    id: string;
    title: string;
    /** 用途描述：模型据此判断「什么问题该查这篇」，空着就只按标题判断 */
    description: string | null;
    source: string | null;
    /** 源文件绝对路径（可能没有：例如直接粘贴的文本） */
    sourcePath: string | null;
    /** 解析产物（markdown）绝对路径 */
    markdownPath: string | null;
    createdAt: number;
    chunkCount: number;
}

export interface DocumentInput {
    id: string;
    title: string;
    description?: string;
    source?: string;
    sourcePath?: string;
    markdownPath?: string;
    /** 内容的 sha256，用来去重 */
    contentHash?: string;
}

/** 只写 chunks（文档行已存在时用，例如重建索引） */
export function insertChunks(
    db: DatabaseSync,
    chunks: TextChunk[],
    vectors: number[][],
    embedder: Pick<Embedder, 'name' | 'dim'>,
): void {
    const insertChunk = db.prepare(
        `INSERT INTO chunks
            (id, document_id, document_title, heading_path, start_line, end_line, text, embedding, embedding_model, embedding_dim)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertTerms = db.prepare('INSERT INTO chunks_fts (chunk_id, terms) VALUES (?, ?)');

    for (const [index, chunk] of chunks.entries()) {
        const vector = vectors[index] ?? [];
        const blob = vector.length > 0 ? Buffer.from(new Float32Array(vector).buffer) : null;

        insertChunk.run(
            chunk.id,
            chunk.documentId,
            chunk.documentTitle,
            JSON.stringify(chunk.headingPath),
            chunk.startLine,
            chunk.endLine,
            chunk.text,
            blob,
            embedder.name,
            embedder.dim,
        );

        // 标题和标题路径一起进索引：正文没有「分块」二字也能被搜到
        insertTerms.run(
            chunk.id,
            tokenize(`${chunk.documentTitle} ${chunk.headingPath.join(' ')} ${chunk.text}`).join(
                ' ',
            ),
        );
    }
}

/**
 * 重命名文档。
 *
 * documents 和 chunks 都存了标题（chunks 里是冗余的），两处都要改；
 * 全文索引里的 terms 也包含标题词，得按块重建，否则搜旧标题还能搜到。
 */
export function renameDocument(db: DatabaseSync, documentId: string, title: string): boolean {
    const result = db
        .prepare('UPDATE documents SET title = ? WHERE id = ?')
        .run(title, documentId);

    if (Number(result.changes) === 0) {
        return false;
    }

    db.prepare('UPDATE chunks SET document_title = ? WHERE document_id = ?').run(
        title,
        documentId,
    );

    const rows = db
        .prepare('SELECT id, heading_path, text FROM chunks WHERE document_id = ?')
        .all(documentId) as unknown as { id: string; heading_path: string; text: string }[];

    const updateTerms = db.prepare('UPDATE chunks_fts SET terms = ? WHERE chunk_id = ?');

    for (const row of rows) {
        const headingPath = JSON.parse(row.heading_path) as string[];

        updateTerms.run(
            tokenize(`${title} ${headingPath.join(' ')} ${row.text}`).join(' '),
            row.id,
        );
    }

    return true;
}

/** 改文档用途描述；模型看的就是这段文字 */
export function updateDocumentDescription(
    db: DatabaseSync,
    documentId: string,
    description: string,
): boolean {
    const result = db
        .prepare('UPDATE documents SET description = ? WHERE id = ?')
        .run(description.trim() || null, documentId);

    return Number(result.changes) > 0;
}

/** 删掉一篇文档的所有块和索引行（重建索引用） */
export function deleteChunksOfDocument(db: DatabaseSync, documentId: string): void {
    const chunkIds = db
        .prepare('SELECT id FROM chunks WHERE document_id = ?')
        .all(documentId) as unknown as { id: string }[];

    const deleteTerms = db.prepare('DELETE FROM chunks_fts WHERE chunk_id = ?');

    for (const row of chunkIds) {
        deleteTerms.run(row.id);
    }

    db.prepare('DELETE FROM chunks WHERE document_id = ?').run(documentId);
}

/** 一篇文档 + 它的 chunks 一起写入；chunks 同时进全文索引 */
export function insertDocument(
    db: DatabaseSync,
    document: DocumentInput,
    chunks: TextChunk[],
    vectors: number[][],
    embedder: Pick<Embedder, 'name' | 'dim'>,
): void {
    db.prepare(
        `INSERT INTO documents (id, title, description, source, source_path, markdown_path, content_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        document.id,
        document.title,
        document.description?.trim() || null,
        document.source ?? null,
        document.sourcePath ?? null,
        document.markdownPath ?? null,
        document.contentHash ?? null,
        Date.now(),
    );

    insertChunks(db, chunks, vectors, embedder);
}

/** 单篇文档（打开原文时用） */
export function getDocumentById(db: DatabaseSync, id: string): DocumentRow | null {
    const row = db
        .prepare(
            `SELECT d.id, d.title, d.description, d.source,
                    d.source_path AS sourcePath,
                    d.markdown_path AS markdownPath,
                    d.created_at AS createdAt,
                    COUNT(c.id) AS chunkCount
               FROM documents d
               LEFT JOIN chunks c ON c.document_id = d.id
              WHERE d.id = ?
              GROUP BY d.id`,
        )
        .get(id) as unknown as DocumentRow | undefined;

    return row ? { ...row, chunkCount: Number(row.chunkCount) } : null;
}

export function listDocuments(db: DatabaseSync): DocumentRow[] {
    const rows = db
        .prepare(
            `SELECT d.id, d.title, d.description, d.source,
                    d.source_path AS sourcePath,
                    d.markdown_path AS markdownPath,
                    d.created_at AS createdAt,
                    COUNT(c.id) AS chunkCount
               FROM documents d
               LEFT JOIN chunks c ON c.document_id = d.id
              GROUP BY d.id
              ORDER BY d.created_at DESC`,
        )
        .all() as unknown as DocumentRow[];

    return rows.map((row) => ({ ...row, chunkCount: Number(row.chunkCount) }));
}

export function deleteDocument(db: DatabaseSync, documentId: string): boolean {
    const chunkIds = db
        .prepare('SELECT id FROM chunks WHERE document_id = ?')
        .all(documentId) as unknown as { id: string }[];

    const deleteTerms = db.prepare('DELETE FROM chunks_fts WHERE chunk_id = ?');

    for (const row of chunkIds) {
        deleteTerms.run(row.id);
    }

    db.prepare('DELETE FROM chunks WHERE document_id = ?').run(documentId);

    const result = db.prepare('DELETE FROM documents WHERE id = ?').run(documentId);
    return Number(result.changes) > 0;
}

export function countChunks(db: DatabaseSync): number {
    return (db.prepare('SELECT COUNT(*) AS c FROM chunks').get() as { c: number }).c;
}

export interface ExistingDocument {
    id: string;
    title: string;
    chunkCount: number;
}

/** 按内容哈希找已存在的文档：同一份内容只入库一次 */
export function findDocumentByHash(db: DatabaseSync, hash: string): ExistingDocument | null {
    const row = db
        .prepare(
            `SELECT d.id, d.title, COUNT(c.id) AS chunkCount
               FROM documents d
               LEFT JOIN chunks c ON c.document_id = d.id
              WHERE d.content_hash = ?
              GROUP BY d.id
              ORDER BY d.created_at
              LIMIT 1`,
        )
        .get(hash) as unknown as { id: string; title: string; chunkCount: number } | undefined;

    if (!row) {
        return null;
    }

    return { id: row.id, title: row.title, chunkCount: Number(row.chunkCount) };
}

/** BM25 关键词检索：FTS5 的 bm25() 越小越相关，取负转成越大越好 */
export function bm25Search(
    db: DatabaseSync,
    query: string,
    limit = 20,
): { chunkId: string; score: number }[] {
    const terms = tokenize(query);

    if (terms.length === 0) {
        return [];
    }

    const match = terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(' OR ');
    const rows = db
        .prepare(
            `SELECT chunk_id, bm25(chunks_fts) AS rank
               FROM chunks_fts
              WHERE chunks_fts MATCH ?
              ORDER BY rank
              LIMIT ?`,
        )
        .all(match, limit) as unknown as { chunk_id: string; rank: number }[];

    return rows.map((row) => ({ chunkId: row.chunk_id, score: -row.rank }));
}

/**
 * 读全部向量到内存。
 * 十万 chunk 以内够用；再往上应该换成 sqlite-vec 的近似最近邻。
 */
export function loadVectors(db: DatabaseSync): Map<string, Float32Array> {
    const rows = db
        .prepare('SELECT id, embedding FROM chunks WHERE embedding IS NOT NULL')
        .all() as unknown as { id: string; embedding: Uint8Array }[];

    const vectors = new Map<string, Float32Array>();

    for (const row of rows) {
        // 复制一份确保 4 字节对齐，再按 Float32 解读
        const copy = new Uint8Array(row.embedding);
        vectors.set(row.id, new Float32Array(copy.buffer));
    }

    return vectors;
}

interface ChunkRow {
    id: string;
    document_id: string;
    document_title: string;
    heading_path: string;
    start_line: number;
    end_line: number;
    text: string;
}

/** 取候选块的索引词，用来算「查询词命中覆盖率」——没有向量时的置信度来源 */
export function loadTermTexts(db: DatabaseSync, ids: string[]): Map<string, string> {
    if (ids.length === 0) {
        return new Map();
    }

    const placeholders = ids.map(() => '?').join(', ');
    const rows = db
        .prepare(`SELECT chunk_id, terms FROM chunks_fts WHERE chunk_id IN (${placeholders})`)
        .all(...ids) as unknown as { chunk_id: string; terms: string }[];

    return new Map(rows.map((row) => [row.chunk_id, row.terms]));
}

function toChunk(row: ChunkRow): TextChunk {
    return {
        id: row.id,
        documentId: row.document_id,
        documentTitle: row.document_title,
        headingPath: JSON.parse(row.heading_path) as string[],
        startLine: row.start_line,
        endLine: row.end_line,
        text: row.text,
    };
}

export function loadChunks(db: DatabaseSync, ids: string[]): Map<string, TextChunk> {
    if (ids.length === 0) {
        return new Map();
    }

    const placeholders = ids.map(() => '?').join(', ');
    const rows = db
        .prepare(`SELECT * FROM chunks WHERE id IN (${placeholders})`)
        .all(...ids) as unknown as ChunkRow[];

    return new Map(rows.map((row) => [row.id, toChunk(row)]));
}
