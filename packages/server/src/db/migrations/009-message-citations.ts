import type { DatabaseSync } from 'node:sqlite';

export const migration = {
    version: 9,
    describe: 'messages: citations',
    up(db: DatabaseSync) {
        const columns = (db.prepare('PRAGMA table_info(messages)').all() as unknown as {
            name: string;
        }[]).map((column) => column.name);

        if (!columns.includes('citations')) {
            // 引用以 JSON 存一列：结构只读、条数少，没必要拆表
            db.exec('ALTER TABLE messages ADD COLUMN citations TEXT');
        }
    },
};
