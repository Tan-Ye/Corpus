import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { migrations } from './migrations';

function resolveDBPath() {
    if (process.env.CORPUS_DB) return process.env.CORPUS_DB;
    const base = process.env.APPDATA ?? join(process.cwd(), 'data');
    return join(base, 'Corpus', 'corpus.db');
}

const dbPath = resolveDBPath();

mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA busy_timeout = 5000');

export async function runMigrations() {
    db.exec(
        `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);`,
    );

    const applied = new Set(
        (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(
            (row) => row.version,
        ),
    );

    const pedding = migrations
        .filter((m) => !applied.has(m.version))
        .toSorted((a, b) => a.version - b.version);

    if (pedding.length === 0) return;

    // 有迁移才备份，没迁移不动文件
    await backup(db, `${dbPath}.backup`);

    for (const migration of pedding) {
        db.exec('BEGIN');
        try {
            migration.up(db);
            db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
                migration.version,
                Date.now(),
            );
            db.exec('COMMIT');
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    }
}
