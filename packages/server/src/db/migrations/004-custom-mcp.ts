import type { DatabaseSync } from 'node:sqlite';

export const migration = {
    version: 4,
    describe: 'custom_mcp',
    up(db: DatabaseSync) {
        // 用户自己添加的 MCP：定义存在库里，内置的仍在 plugins/ 目录
        db.exec(`
            CREATE TABLE custom_mcp (
                id          TEXT PRIMARY KEY,
                name        TEXT,
                description TEXT,
                model_hint  TEXT,
                tools       TEXT,
                transport   TEXT NOT NULL,
                created_at  INTEGER NOT NULL
            );
        `);
    },
};
