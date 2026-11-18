import { Router } from 'express';

import { db } from '../db';
import { currentLLMConfig, saveLLMConfig } from '../llm-config';
import { getDocumentStoragePath, setDocumentStoragePath } from '../utils/document-storage';
import { migrateDocumentStorage } from '../utils/storage-migration';
import type { StorageMigrationResult } from '../utils/storage-migration';

const router = Router();

/** 模型配置：apiKey 只回「有没有」，永远不回内容 */
router.get('/llm', (_req, res) => {
    res.json(currentLLMConfig());
});

/** 保存模型配置：写库后立即生效，不用重启服务 */
router.put('/llm', (req, res) => {
    const baseUrl = req.body?.baseUrl;
    const model = req.body?.model;
    const apiKey = req.body?.apiKey;

    if (typeof baseUrl !== 'string' || typeof model !== 'string') {
        res.status(400).json({ error: 'baseUrl 和 model 必须是字符串' });
        return;
    }

    if (apiKey !== undefined && typeof apiKey !== 'string') {
        res.status(400).json({ error: 'apiKey 必须是字符串' });
        return;
    }

    try {
        res.json(saveLLMConfig({ baseUrl, model, apiKey }));
    } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

/** 文档存储设置：没设置过时 storagePath 为 null，前端据此禁止上传 */
router.get('/documents', (_req, res) => {
    res.json({ storagePath: getDocumentStoragePath(db) });
});

/**
 * 保存存储位置。
 *
 * migrate=true 时把旧目录里的文件搬到新目录——改路径不迁移，
 * 用户的旧文档就会「引用点不开」，所以迁移做成显式选项，不偷偷搬。
 */
router.put('/documents', (req, res) => {
    const storagePath = req.body?.storagePath;
    const migrate = req.body?.migrate === true;

    if (typeof storagePath !== 'string') {
        res.status(400).json({ error: 'storagePath 必须是字符串' });
        return;
    }

    const previous = getDocumentStoragePath(db);
    let saved: string;

    try {
        saved = setDocumentStoragePath(db, storagePath);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(400).json({ error: message });
        return;
    }

    let migration: StorageMigrationResult | null = null;

    if (migrate && previous && previous !== saved) {
        try {
            migration = migrateDocumentStorage(db, previous, saved);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            res.status(500).json({ error: `目录已保存，但迁移失败：${message}` });
            return;
        }
    }

    res.json({ storagePath: saved, migration });
});

export default router;
