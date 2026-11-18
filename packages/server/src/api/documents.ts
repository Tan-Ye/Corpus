import express, { Router } from 'express';
import { readFileSync } from 'node:fs';

import { db } from '../db';
import { getEmbedder } from '../retrieval/embedder';
import { hashMarkdown, ingestDocument } from '../retrieval/ingest';
import { reindexDocuments } from '../retrieval/reindex';
import { searchChunks } from '../retrieval/search';
import { deleteDocument, findDocumentByHash, getDocumentById, listDocuments, renameDocument, updateDocumentDescription } from '../retrieval/store';
import { parseDocument } from '../utils/docs';
import {
    getDocumentStoragePath,
    removeDocumentFiles,
    saveMarkdown,
    saveSourceFile,
} from '../utils/document-storage';

const router = Router();

/** 单文件上限 25MB：足够放技术文档，也不至于把内存打满 */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** 已入库的文档 */
router.get('/', (_req, res) => {
    res.json(listDocuments(db));
});

/**
 * 直接给一段 Markdown 正文入库（粘贴/脚本用）。
 * 同样会落一份 markdown 到数据目录，保证所有文档都有可追溯的原文文件。
 */
router.post('/', async (req, res) => {
    const { title, content, source, description } = req.body ?? {};

    if (typeof content !== 'string' || !content.trim()) {
        res.status(400).json({ error: 'content 不能为空' });
        return;
    }

    const documentId = crypto.randomUUID();

    // 先查重再落盘：重复内容不再写文件，避免留下孤儿 markdown
    const existing = findDocumentByHash(db, hashMarkdown(content));

    if (existing) {
        res.status(200).json({
            documentId: existing.id,
            headingCount: 0,
            chunkCount: existing.chunkCount,
            deduplicated: true,
        });
        return;
    }

    try {
        // 设置过存储位置才落一份 markdown；没设置时纯文本入库仍然可用，只是没有原文文件
        const markdownPath = getDocumentStoragePath(db)
            ? saveMarkdown(db, documentId, content)
            : undefined;

        const result = await ingestDocument(
            db,
            {
                documentId,
                title: typeof title === 'string' && title.trim() ? title : '未命名文档',
                description: typeof description === 'string' ? description : undefined,
                text: content,
                source: typeof source === 'string' ? source : '手动输入',
                markdownPath,
            },
            getEmbedder(),
        );

        res.status(201).json({ ...result, markdownPath });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(400).json({ error: message });
    }
});

/**
 * 文件上传：原始二进制放 body，文件名走 query。
 *
 *   POST /api/documents/upload?filename=spec.pdf
 *   Content-Type: application/octet-stream
 *
 * 不引 multipart 依赖：只有一个文件字段，浏览器端用 fetch + file.arrayBuffer() 就能发。
 */
router.post('/upload', express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), async (req, res) => {
    const filename = String(req.query.filename ?? '').trim();
    const description = String(req.query.description ?? '').trim();

    if (!filename) {
        res.status(400).json({ error: '缺少 filename 查询参数' });
        return;
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: '文件内容为空' });
        return;
    }

    const documentId = crypto.randomUUID();

    // 上传必须先设置存储位置：否则文件没处放，用户也会一头雾水
    if (!getDocumentStoragePath(db)) {
        res.status(400).json({
            error: '还没有设置文件存储位置，请先在「上传设置」里填写绝对路径',
        });
        return;
    }

    try {
        const parsed = await parseDocument(filename, req.body);

        // 同一份内容（哪怕文件名不同）只入库一次
        const existing = findDocumentByHash(db, hashMarkdown(parsed.markdown));

        if (existing) {
            res.status(200).json({
                documentId: existing.id,
                headingCount: 0,
                chunkCount: existing.chunkCount,
                deduplicated: true,
                format: parsed.format,
            });
            return;
        }

        const sourcePath = saveSourceFile(db, documentId, filename, req.body);
        const markdownPath = saveMarkdown(db, documentId, parsed.markdown);

        const result = await ingestDocument(
            db,
            {
                documentId,
                title: filename.replace(/\.[^.]+$/, ''),
                description: description || undefined,
                text: parsed.markdown,
                source: filename,
                sourcePath,
                markdownPath,
            },
            getEmbedder(),
        );

        res.status(201).json({ ...result, format: parsed.format, sourcePath, markdownPath });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(400).json({ error: message });
    }
});

/**
 * 重建索引：按磁盘上的 markdown 重新解析、分块、写 chunk。
 * 改分块参数或换 embedding 模型后用它，不用重新上传文件。
 */
router.post('/reindex', async (_req, res) => {
    try {
        res.json(await reindexDocuments(db, getEmbedder()));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

/** 检索：返回带 locator 的命中片段 */
router.get('/search', async (req, res) => {
    const query = String(req.query.q ?? '').trim();

    if (!query) {
        res.status(400).json({ error: '缺少查询参数 q' });
        return;
    }

    const limit = Number(req.query.limit ?? 5) || 5;
    const threshold =
        req.query.threshold === undefined ? undefined : Number(req.query.threshold);

    try {
        res.json(await searchChunks(db, query, { embedder: getEmbedder(), limit, threshold }));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

/**
 * 打开原文：按行返回 markdown，供引用定位用。
 *
 * 只看需要的那一段，不把 13 万字的法规整篇发给前端。
 * 没保存 markdown（比如没配存储位置时粘贴的文档）就没法定位，返回 409 说明原因。
 */
router.get('/:id/content', (req, res) => {
    const document = getDocumentById(db, req.params.id);

    if (!document) {
        res.status(404).json({ error: '文档不存在' });
        return;
    }

    if (!document.markdownPath) {
        res.status(409).json({ error: '这篇文档没有保存 markdown 原文，无法定位' });
        return;
    }

    let text: string;

    try {
        text = readFileSync(document.markdownPath, 'utf8');
    } catch {
        res.status(410).json({ error: '原文文件已丢失（可能被手动删除或移动）' });
        return;
    }

    const lines = text.split('\n');
    const requestedStart = Number.parseInt(String(req.query.start ?? '1'), 10);
    const requestedEnd = Number.parseInt(String(req.query.end ?? ''), 10);
    const startLine = Math.min(
        Math.max(1, Number.isNaN(requestedStart) ? 1 : requestedStart),
        Math.max(1, lines.length),
    );
    const endLine = Math.min(
        Math.max(startLine, Number.isNaN(requestedEnd) ? startLine + 40 : requestedEnd),
        lines.length,
    );

    res.json({
        documentId: document.id,
        title: document.title,
        source: document.source,
        totalLines: lines.length,
        startLine,
        endLine,
        lines: lines.slice(startLine - 1, endLine),
    });
});

/** 改文档属性：标题（同步全文索引）和用途描述（模型据此决定查不查） */
router.patch('/:id', (req, res) => {
    const hasTitle = typeof req.body?.title === 'string';
    const hasDescription = typeof req.body?.description === 'string';
    const title = hasTitle ? (req.body.title as string).trim() : '';
    const description = hasDescription ? (req.body.description as string).trim() : '';

    if (!hasTitle && !hasDescription) {
        res.status(400).json({ error: '至少要改一项：title 或 description' });
        return;
    }

    if (hasTitle && !title) {
        res.status(400).json({ error: '标题不能为空' });
        return;
    }

    if (title.length > 120) {
        res.status(400).json({ error: '标题不能超过 120 个字符' });
        return;
    }

    if (description.length > 300) {
        res.status(400).json({ error: '用途描述不能超过 300 个字符' });
        return;
    }

    const document = getDocumentById(db, req.params.id);

    if (!document) {
        res.status(404).json({ error: '文档不存在' });
        return;
    }

    if (hasTitle) {
        renameDocument(db, req.params.id, title);
    }

    if (hasDescription) {
        updateDocumentDescription(db, req.params.id, description);
    }

    res.json({
        id: req.params.id,
        title: hasTitle ? title : document.title,
        description: hasDescription ? description : document.description,
    });
});

/**
 * 删除文档：默认只删索引，磁盘上的原件保留，方便人工核对。
 * `?purgeFiles=1` 时连源文件和 markdown 一起删。
 */
router.delete('/:id', (req, res) => {
    const document = getDocumentById(db, req.params.id);

    if (!document) {
        res.status(404).json({ error: '文档不存在' });
        return;
    }

    deleteDocument(db, req.params.id);

    const purgeFiles = req.query.purgeFiles === '1' || req.query.purgeFiles === 'true';
    const removedFiles = purgeFiles
        ? removeDocumentFiles(db, {
              markdownPath: document.markdownPath,
              sourcePath: document.sourcePath,
          })
        : [];

    res.json({ removed: true, removedFiles });
});

export default router;
