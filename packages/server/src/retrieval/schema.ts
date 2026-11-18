import type { DatabaseSync } from 'node:sqlite';

/**
 * 检索相关的表结构。
 * 迁移和测试都调这一个函数，避免两边 SQL 漂移。
 *
 * 注意：这里必须和最新迁移后的结构一致（含 006 的 source_path/markdown_path、
 * 012 的 description），否则只建 schema 的测试会缺列。
 */
export function createRetrievalSchema(db: DatabaseSync): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS documents (
            id            TEXT PRIMARY KEY,
            title         TEXT NOT NULL,
            description   TEXT,
            source        TEXT,
            source_path   TEXT,
            markdown_path TEXT,
            content_hash  TEXT,
            created_at    INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash);

        CREATE TABLE IF NOT EXISTS chunks (
            id              TEXT PRIMARY KEY,
            document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            document_title  TEXT NOT NULL,
            heading_path    TEXT NOT NULL,
            start_line      INTEGER NOT NULL,
            end_line        INTEGER NOT NULL,
            text            TEXT NOT NULL,
            embedding       BLOB,
            embedding_model TEXT NOT NULL,
            embedding_dim   INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);

        -- 关键词检索用：只存分词后的 terms，正文在 chunks 里
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
            chunk_id UNINDEXED,
            terms,
            tokenize = 'unicode61'
        );
    `);
}
