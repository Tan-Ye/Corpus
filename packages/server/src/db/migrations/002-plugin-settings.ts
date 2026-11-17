import type { DatabaseSync } from 'node:sqlite';

export const migration = {
    version: 2,
    describe: 'plugin_settings',
    up(db: DatabaseSync) {
        // 插件的开关状态：enabled 1 开、0 关；没有记录视为开启
        db.exec(`
            CREATE TABLE plugin_settings (
                id      TEXT PRIMARY KEY,
                enabled INTEGER NOT NULL
            );
        `);
    },
};
