import type { DatabaseSync } from 'node:sqlite';

export const migration = {
    version: 3,
    describe: 'logs',
    up(db: DatabaseSync) {
        // 日志和会话用普通字段关联（不建外键）：会话删了，日志仍要能查
        db.exec(`
            CREATE TABLE logs (
                id              TEXT PRIMARY KEY,
                conversation_id TEXT,
                type            TEXT NOT NULL CHECK (type IN ('tool', 'llm', 'error')),
                name            TEXT NOT NULL,
                detail          TEXT,
                duration_ms     INTEGER,
                ok              INTEGER NOT NULL,
                created_at      INTEGER NOT NULL
            );

            CREATE INDEX idx_logs_created_at ON logs(created_at);
            CREATE INDEX idx_logs_conversation ON logs(conversation_id);
        `);
    },
};
