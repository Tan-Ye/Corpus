import { db } from '../db';

export type LogType = 'tool' | 'llm' | 'error' | 'retrieval';

export interface LogEntry {
    id: string;
    conversationId: string | null;
    type: LogType;
    /** 工具名 / llm 轮次标签 / 错误来源 */
    name: string;
    /** 简短描述：工具参数摘要或错误信息，不含对话正文 */
    detail?: string;
    durationMs?: number;
    ok: boolean;
    createdAt: number;
}

export interface LogFilter {
    from?: number;
    to?: number;
    type?: LogType;
    conversationId?: string;
}

export interface LogQuery extends LogFilter {
    limit: number;
    offset: number;
}

export interface LogStats {
    /** 总条数 */
    total: number;
    /** 最早一条的时间戳，没有则是 null */
    oldest: number | null;
    /** 属于「超过 30 天没更新的会话」的日志条数 */
    stale: number;
}

/** 会话多久没更新算"陈旧" */
export const STALE_DAYS = 30;

interface LogRow {
    id: string;
    conversation_id: string | null;
    type: LogType;
    name: string;
    detail: string | null;
    duration_ms: number | null;
    ok: number;
    created_at: number;
}

function toEntry(row: LogRow): LogEntry {
    return {
        id: row.id,
        conversationId: row.conversation_id,
        type: row.type,
        name: row.name,
        detail: row.detail ?? undefined,
        durationMs: row.duration_ms ?? undefined,
        ok: row.ok === 1,
        createdAt: row.created_at,
    };
}

export function appendLog(entry: Omit<LogEntry, 'id' | 'createdAt'>): void {
    db.prepare(
        `INSERT INTO logs (id, conversation_id, type, name, detail, duration_ms, ok, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        crypto.randomUUID(),
        entry.conversationId,
        entry.type,
        entry.name,
        entry.detail ?? null,
        entry.durationMs ?? null,
        entry.ok ? 1 : 0,
        Date.now(),
    );
}

/** 把过滤条件翻成 WHERE 片段，查询和删除共用 */
function buildWhere(filter: LogFilter): { clause: string; params: (string | number)[] } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter.from !== undefined) {
        conditions.push('created_at >= ?');
        params.push(filter.from);
    }
    if (filter.to !== undefined) {
        conditions.push('created_at <= ?');
        params.push(filter.to);
    }
    if (filter.type) {
        conditions.push('type = ?');
        params.push(filter.type);
    }
    if (filter.conversationId) {
        conditions.push('conversation_id = ?');
        params.push(filter.conversationId);
    }

    return {
        clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
        params,
    };
}

export function queryLogs(query: LogQuery): { items: LogEntry[]; total: number } {
    const { clause, params } = buildWhere(query);

    const total = (db.prepare(`SELECT COUNT(*) AS c FROM logs ${clause}`).get(...params) as {
        c: number;
    }).c;

    const rows = db
        .prepare(`SELECT * FROM logs ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .all(...params, query.limit, query.offset) as unknown as LogRow[];

    return { items: rows.map(toEntry), total };
}

export function deleteLogs(filter: LogFilter): number {
    const { clause, params } = buildWhere(filter);
    const result = db.prepare(`DELETE FROM logs ${clause}`).run(...params);

    return Number(result.changes);
}

export interface LogConversation {
    id: string;
    /** 会话标题；会话已删就标注出来 */
    title: string;
    count: number;
}

/** 有日志的会话列表，按最近一条日志排序 */
export function listLogConversations(): LogConversation[] {
    const rows = db
        .prepare(
            `SELECT l.conversation_id AS id,
                    COALESCE(c.title, '(已删除的会话)') AS title,
                    COUNT(*) AS count,
                    MAX(l.created_at) AS latest
               FROM logs l
               LEFT JOIN conversations c ON c.id = l.conversation_id
              WHERE l.conversation_id IS NOT NULL
              GROUP BY l.conversation_id
              ORDER BY latest DESC`,
        )
        .all() as unknown as { id: string; title: string; count: number }[];

    return rows.map((row) => ({ id: row.id, title: row.title, count: row.count }));
}

export function getLogStats(): LogStats {
    const base = db.prepare('SELECT COUNT(*) AS c, MIN(created_at) AS oldest FROM logs').get() as {
        c: number;
        oldest: number | null;
    };

    const staleCutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
    const stale = (
        db
            .prepare(
                `SELECT COUNT(*) AS c FROM logs
                  WHERE conversation_id IS NOT NULL
                    AND conversation_id IN (SELECT id FROM conversations WHERE updated_at < ?)`,
            )
            .get(staleCutoff) as { c: number }
    ).c;

    return { total: base.c, oldest: base.oldest, stale };
}
