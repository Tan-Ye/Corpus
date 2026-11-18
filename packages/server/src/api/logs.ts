import { Router } from 'express';

import { deleteLogs, getLogStats, listLogConversations, queryLogs } from '../repository';
import type { LogFilter, LogType } from '../repository';

const router = Router();

const LOG_TYPES: LogType[] = ['tool', 'llm', 'error', 'retrieval'];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function numberParam(value: unknown): number | undefined {
    if (typeof value !== 'string' || value === '') {
        return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function readFilter(source: Record<string, unknown>): LogFilter {
    const type = LOG_TYPES.find((item) => item === source.type);
    const conversationId =
        typeof source.conversationId === 'string' && source.conversationId
            ? source.conversationId
            : undefined;

    return {
        from: numberParam(source.from),
        to: numberParam(source.to),
        type,
        conversationId,
    };
}

/** 概览：总条数、最早时间、陈旧日志条数（前端用来决定要不要提示清理） */
router.get('/stats', (_req, res) => {
    res.json(getLogStats());
});

/** 有日志的会话列表：左侧列表用 */
router.get('/conversations', (_req, res) => {
    res.json(listLogConversations());
});

router.get('/', (req, res) => {
    const limit = Math.min(numberParam(req.query.limit) ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = numberParam(req.query.offset) ?? 0;

    res.json(queryLogs({ ...readFilter(req.query as Record<string, unknown>), limit, offset }));
});

/**
 * 删除：按当前筛选条件批量删。
 * 不传条件必须显式带 all=true，避免误删全部。
 */
router.delete('/', (req, res) => {
    const source = { ...(req.query as Record<string, unknown>), ...req.body };
    const all = source.all === true || source.all === 'true';
    const filter = readFilter(source);

    const hasFilter = Object.values(filter).some((value) => value !== undefined);
    if (!all && !hasFilter) {
        res.status(400).json({ error: '请指定删除范围（时间、类型或会话）' });
        return;
    }

    res.json({ deleted: deleteLogs(all ? {} : filter) });
});

export default router;
