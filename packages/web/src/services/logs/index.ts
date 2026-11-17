import { del, get } from '@/utils/request';

export type LogType = 'tool' | 'llm' | 'error';

export interface LogEntry {
    id: string;
    conversationId: string | null;
    type: LogType;
    name: string;
    detail?: string;
    durationMs?: number;
    ok: boolean;
    createdAt: number;
}

export interface LogStats {
    total: number;
    /** 最早一条的时间戳 */
    oldest: number | null;
    /** 属于「30 天没更新的会话」的条数 */
    stale: number;
}

export interface LogConversation {
    id: string;
    title: string;
    count: number;
}

export interface LogFilter {
    from?: number;
    to?: number;
    type?: LogType;
    conversationId?: string;
}

export interface LogQuery extends LogFilter {
    limit?: number;
    offset?: number;
}

function toQueryString(query: object): string {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
            params.set(key, String(value));
        }
    }

    const text = params.toString();
    return text ? `?${text}` : '';
}

export function listLogs(query: LogQuery = {}): Promise<{ items: LogEntry[]; total: number }> {
    return get(`/logs${toQueryString(query)}`);
}

export function getLogStats(): Promise<LogStats> {
    return get('/logs/stats');
}

/** 左侧列表：有日志的会话 */
export function listLogConversations(): Promise<LogConversation[]> {
    return get('/logs/conversations');
}

/** 按筛选条件批量删；传 all 才会删全部 */
export function clearLogs(filter: LogFilter & { all?: boolean }): Promise<{ deleted: number }> {
    return del(`/logs${toQueryString(filter)}`);
}
