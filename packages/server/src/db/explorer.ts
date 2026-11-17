import { DatabaseSync } from 'node:sqlite';

import { DB_PATH } from './index';

export interface TableInfo {
    name: string;
    rows: number;
}

export interface QueryResult {
    columns: string[];
    rows: unknown[][];
    total: number;
    page: number;
    pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const MAX_CELL_LENGTH = 2000;
const ALLOWED_PREFIX = /^(select|with|pragma)\b/i;

/**
 * 给数据库浏览器单独开一个只读连接。
 * 不复用主连接：写操作和写型 PRAGMA 在 SQLite 层就被拒，比靠正则可信。
 * WAL 模式下多一个读连接没有代价。
 */
let reader: DatabaseSync | null = null;

function getReader(): DatabaseSync {
    if (!reader) {
        reader = new DatabaseSync(DB_PATH, { readOnly: true });
    }
    return reader;
}

function quoteIdentifier(name: string): string {
    return `"${String(name).replaceAll('"', '""')}"`;
}

function truncate(value: unknown): unknown {
    if (typeof value === 'string' && value.length > MAX_CELL_LENGTH) {
        return `${value.slice(0, MAX_CELL_LENGTH)}…（已截断）`;
    }
    return value;
}

function toResult(
    rows: Record<string, unknown>[],
    total: number,
    page: number,
    pageSize: number,
): QueryResult {
    const first = rows[0];
    const columns = first ? Object.keys(first) : [];

    return {
        columns,
        rows: rows.map((row) => columns.map((column) => truncate(row[column]))),
        total,
        page,
        pageSize,
    };
}

export function listTables(): TableInfo[] {
    const rows = getReader()
        .prepare(
            `SELECT name FROM sqlite_master
              WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
              ORDER BY name`,
        )
        .all() as { name: string }[];

    return rows.map((row) => ({
        name: row.name,
        rows: (getReader().prepare(`SELECT COUNT(*) AS c FROM ${quoteIdentifier(row.name)}`).get() as { c: number }).c,
    }));
}

export function describeTable(name: string): Record<string, unknown>[] {
    if (!name) {
        throw new Error('缺少表名');
    }

    return getReader().prepare(`PRAGMA table_info(${quoteIdentifier(name)})`).all() as Record<
        string,
        unknown
    >[];
}

/**
 * 执行只读查询并分页。
 *
 * 三道闸：只放行 SELECT / WITH / PRAGMA、一次只能一条语句、连接本身只读。
 */
export function runQuery(sql: string, page: number, pageSize: number): QueryResult {
    const trimmed = String(sql ?? '')
        .trim()
        .replace(/;$/, '')
        .trim();

    if (!trimmed) {
        throw new Error('SQL 不能为空');
    }
    if (!ALLOWED_PREFIX.test(trimmed)) {
        throw new Error('只允许 SELECT / WITH / PRAGMA');
    }
    if (trimmed.includes(';')) {
        throw new Error('一次只能执行一条语句');
    }

    const size = Math.min(Math.max(Number(pageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const current = Math.max(Number(page) || 1, 1);

    // PRAGMA 不分页
    if (/^pragma\b/i.test(trimmed)) {
        const rows = getReader().prepare(trimmed).all() as Record<string, unknown>[];
        return toResult(rows, rows.length, 1, rows.length);
    }

    const total = (getReader().prepare(`SELECT COUNT(*) AS c FROM (${trimmed})`).get() as {
        c: number;
    }).c;
    const rows = getReader()
        .prepare(`SELECT * FROM (${trimmed}) LIMIT ? OFFSET ?`)
        .all(size, (current - 1) * size) as Record<string, unknown>[];

    return toResult(rows, total, current, size);
}
