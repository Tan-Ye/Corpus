import { get, post } from '@/utils/request';

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

export const PAGE_SIZE = 50;

export function listTables(): Promise<TableInfo[]> {
    return get<TableInfo[]>('/db/tables');
}

/** 分页由服务端做：前端只给页码，不自己切数据 */
export function runQuery(sql: string, page = 1): Promise<QueryResult> {
    return post<QueryResult>('/db/query', { sql, page, pageSize: PAGE_SIZE });
}
