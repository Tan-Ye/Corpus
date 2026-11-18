import { DatabaseSync } from 'node:sqlite';

import { db as defaultDb } from '../db';

export function getSetting(key: string, db: DatabaseSync = defaultDb): string | null {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
        | { value: string }
        | undefined;

    return row?.value ?? null;
}

export function setSetting(key: string, value: string, db: DatabaseSync = defaultDb): void {
    db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(key, value);
}
