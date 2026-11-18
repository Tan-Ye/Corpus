import type { DatabaseSync } from 'node:sqlite';

export const migration = {
    version: 8,
    describe: 'settings',
    up(db: DatabaseSync) {
        // 简单的键值配置：文档存储位置这类「用户设置」放这里，不塞进代码或环境变量
        db.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        `);
    },
};
