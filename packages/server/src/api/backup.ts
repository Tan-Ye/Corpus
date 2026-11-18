import express, { Router } from 'express';

import { db } from '../db';
import { exportDocumentPackage, importDocumentPackage } from '../backup/documents-package';

const router = Router();

/** 备份包上限：文档源文件可能挺大，给到 500MB */
const MAX_PACKAGE_BYTES = 500 * 1024 * 1024;

function stamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * 导出备份：一个 zip，里面只有源文件和清单。
 *
 * 不导出数据库——索引随时能从源文件重建，会话也不需要带走；
 * 这样备份和 schema 版本解耦，以后改分块规则也还能恢复。
 */
router.get('/', (_req, res) => {
    const archive = exportDocumentPackage(db);

    res.setHeader('content-type', 'application/zip');
    res.setHeader('content-disposition', `attachment; filename="corpus-backup-${stamp()}.zip"`);
    res.send(archive);
});

/** 导入备份：解包后逐个文件重新解析、重新切块入库，重复内容自动跳过 */
router.post('/', express.raw({ type: () => true, limit: MAX_PACKAGE_BYTES }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: '文件内容为空' });
        return;
    }

    try {
        res.json(await importDocumentPackage(db, req.body));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(400).json({ error: message });
    }
});

export default router;
