import type { DatabaseSync } from 'node:sqlite';

export const migration = {
    version: 11,
    describe: 'messages: stopped',
    up(db: DatabaseSync) {
        const columns = (db.prepare('PRAGMA table_info(messages)').all() as unknown as {
            name: string;
        }[]).map((column) => column.name);

        if (!columns.includes('stopped')) {
            // 被用户中断的消息：正文照样落库，但历史里要能标出来
            db.exec('ALTER TABLE messages ADD COLUMN stopped INTEGER');
        }
    },
};
