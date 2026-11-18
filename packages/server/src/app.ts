import { existsSync } from 'node:fs';
import { join } from 'node:path';

import express, { type ErrorRequestHandler } from 'express';
import {
    healthzApi,
    chatReadyzApi,
    chatApi,
    conversationApi,
    toolsApi,
    dbApi,
    pluginsApi,
    logsApi,
    documentsApi,
    settingsApi,
    backupApi,
} from './api';

/**
 * 统一错误出口。Express 默认的 finalhandler 在非 production 下会把错误堆栈
 * 以 HTML 回给前端：界面只能显示「请求失败（500）」，堆栈和绝对路径也泄露给页面。
 */
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const type = (error as { type?: string } | null)?.type;

    if (type === 'entity.too.large') {
        res.status(413).json({ error: '请求内容过大，请新开会话' });
        return;
    }

    const rawStatus = (error as { status?: number } | null)?.status;
    const status =
        typeof rawStatus === 'number' && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;

    console.error('[api] 未处理异常:', error);
    res.status(status).json({
        error: error instanceof Error ? error.message : String(error),
    });
};

/**
 * 建 app 但不 listen，方便测试和评测脚本直接拿 app 用。
 * 配置校验不在这里做——调用方先 initLLMConfig 再 createApp。
 *
 * 所有接口统一挂在 /api 下：前端只需要一条代理规则，新增接口不用再改 vite.config。
 */
export function createApp() {
    const app = express();
    // 前端每轮发完整历史；默认 100KB 会让长会话永久 413，且历史只会更长
    app.use(express.json({ limit: '4mb' }));

    app.use('/api/healthz', healthzApi);
    app.use('/api/chat-readyz', chatReadyzApi);
    app.use('/api/chat', chatApi);
    app.use('/api/conversation', conversationApi);
    app.use('/api/tools', toolsApi);
    app.use('/api/db', dbApi);
    app.use('/api/plugins', pluginsApi);
    app.use('/api/logs', logsApi);
    app.use('/api/documents', documentsApi);
    app.use('/api/settings', settingsApi);
    app.use('/api/backup', backupApi);

    // 未匹配的 /api 路径回 JSON：否则前端拿到 HTML，只能显示「请求失败」
    app.use('/api', (_req, res) => {
        res.status(404).json({ error: '接口不存在' });
    });

    // 生产形态：前端构建产物由 server 一起托管，窗口/浏览器只需要一个地址。
    // 开发时没有 dist，这一段自动跳过，前端走 Vite 的 5173。
    const staticDir = process.env.CORPUS_WEB_DIR?.trim();

    if (staticDir && existsSync(join(staticDir, 'index.html'))) {
        app.use(express.static(staticDir, { index: false }));

        // 前端只有一页：非 /api 的 GET 一律回 index.html。
        // 用 root + 相对路径，别传绝对路径：sendFile 默认 dotfiles:'ignore'，
        // 路径里出现 .tmp 这类目录会直接 404。
        app.use((req, res, next) => {
            if (req.method !== 'GET' || req.path.startsWith('/api')) {
                next();
                return;
            }

            res.sendFile('index.html', { root: staticDir });
        });
    }

    app.use(errorHandler);

    return app;
}
