import { db } from '../db';

/** 读全部插件开关；没有记录的插件默认开启 */
export function loadPluginSettings(): Map<string, boolean> {
    const rows = db.prepare('SELECT id, enabled FROM plugin_settings').all() as {
        id: string;
        enabled: number;
    }[];

    return new Map(rows.map((row) => [row.id, row.enabled === 1]));
}

export function savePluginEnabled(id: string, enabled: boolean): void {
    db.prepare(
        `INSERT INTO plugin_settings (id, enabled) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled`,
    ).run(id, enabled ? 1 : 0);
}
