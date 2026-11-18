import type { DatabaseSync } from 'node:sqlite';

/**
 * 给已有库补上源文件路径列。
 *
 * 新库由 005 的 createRetrievalSchema 直接建出这两列，
 * 所以这里必须先查一遍，否则会 duplicate column。
 */
export const migration = {
    version: 6,
    describe: 'documents: source_path + markdown_path',
    up(db: DatabaseSync) {
        const columns = (db.prepare('PRAGMA table_info(documents)').all() as unknown as {
            name: string;
        }[]).map((column) => column.name);

        if (!columns.includes('source_path')) {
            db.exec('ALTER TABLE documents ADD COLUMN source_path TEXT');
        }

        if (!columns.includes('markdown_path')) {
            db.exec('ALTER TABLE documents ADD COLUMN markdown_path TEXT');
        }
    },
};
