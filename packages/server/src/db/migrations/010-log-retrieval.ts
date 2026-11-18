import type { DatabaseSync } from 'node:sqlite';

/**
 * 日志类型增加 retrieval（检索记录）。
 *
 * SQLite 不能改 CHECK 约束，只能重建表：建新表 → 拷数据 → 删旧表 → 改名。
 */
export const migration = {
    version: 10,
    describe: 'logs: allow retrieval type',
    up(db: DatabaseSync) {
        db.exec(`
            CREATE TABLE logs_new (
                id              TEXT PRIMARY KEY,
                conversation_id TEXT,
                type            TEXT NOT NULL CHECK (type IN ('tool', 'llm', 'error', 'retrieval')),
                name            TEXT NOT NULL,
                detail          TEXT,
                duration_ms     INTEGER,
                ok              INTEGER NOT NULL,
                created_at      INTEGER NOT NULL
            );

            INSERT INTO logs_new (id, conversation_id, type, name, detail, duration_ms, ok, created_at)
                SELECT id, conversation_id, type, name, detail, duration_ms, ok, created_at FROM logs;

            DROP TABLE logs;
            ALTER TABLE logs_new RENAME TO logs;

            CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);
            CREATE INDEX IF NOT EXISTS idx_logs_conversation ON logs(conversation_id);
        `);
    },
};
