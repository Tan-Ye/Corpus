import type { DatabaseSync } from 'node:sqlite';

export const migration = {
    version: 7,
    describe: 'documents: content_hash',
    up(db: DatabaseSync) {
        const columns = (db.prepare('PRAGMA table_info(documents)').all() as unknown as {
            name: string;
        }[]).map((column) => column.name);

        if (!columns.includes('content_hash')) {
            db.exec('ALTER TABLE documents ADD COLUMN content_hash TEXT');
        }

        // 不做唯一约束：老库里可能已经有重复文档，建唯一索引会直接失败。
        // 去重放在应用层（单进程写，没有并发竞争）。
        db.exec('CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash)');
    },
};
