import type { DatabaseSync } from 'node:sqlite';

export const migration = {
    version: 12,
    describe: 'documents: description',
    up(db: DatabaseSync) {
        const columns = (
            db.prepare('PRAGMA table_info(documents)').all() as unknown as {
                name: string;
            }[]
        ).map((column) => column.name);

        if (!columns.includes('description')) {
            // 用途描述：模型靠它判断「这个问题该不该查这篇文档」，空着就按标题判断
            db.exec('ALTER TABLE documents ADD COLUMN description TEXT');
        }
    },
};
