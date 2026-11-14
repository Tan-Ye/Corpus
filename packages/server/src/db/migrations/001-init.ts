import type { DatabaseSync } from 'node:sqlite';

export const migration = {
    version: 1,
    describe: 'conversations + messages',
    up(db: DatabaseSync) {
        db.exec(`
            CREATE TABLE conversations (
                id         TEXT PRIMARY KEY,
                title      TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                deleted_at INTEGER
            );

            CREATE TABLE messages (
                seq             INTEGER PRIMARY KEY AUTOINCREMENT,
                id              TEXT NOT NULL UNIQUE,
                conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
                content         TEXT NOT NULL,
                created_at      INTEGER NOT NULL,
                deleted_at      INTEGER
            );

            CREATE INDEX idx_messages_conversation ON messages(conversation_id, seq);
        `);
    },
};
