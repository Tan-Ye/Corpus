import { Router } from 'express';

import { DEFAULT_PAGE_SIZE, listTables, runQuery } from '../db/explorer';

const router = Router();

/** 表清单 */
router.get('/tables', (_req, res) => {
    res.json(listTables());
});

/**
 * 执行只读 SQL。
 * SQL 写错属于调用方问题，回 400；连接层面的异常才回 500。
 */
router.post('/query', (req, res) => {
    const { sql, page = 1, pageSize = DEFAULT_PAGE_SIZE } = req.body ?? {};

    try {
        res.json(runQuery(String(sql ?? ''), Number(page), Number(pageSize)));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(400).json({ error: message });
    }
});

export default router;
