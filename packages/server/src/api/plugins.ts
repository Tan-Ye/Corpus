import { Router } from 'express';

import { toolRegistry } from '../mcp';
import type { McpManifestInput } from '../mcp/registry';

const router = Router();

function readManifest(req: { body?: unknown }): McpManifestInput {
    // 允许直接发 manifest 对象，也允许包一层 { manifest: {...} }
    const body = req.body as { manifest?: McpManifestInput } | McpManifestInput | undefined;
    const manifest = (body as { manifest?: McpManifestInput })?.manifest ?? (body as McpManifestInput);

    if (!manifest || typeof manifest !== 'object') {
        throw new Error('请求体不是合法的 MCP 配置');
    }

    return manifest;
}

/** 只取开关状态：前端启动时快速判断谁开着，不用等完整的插件信息 */
router.get('/states', (_req, res) => {
    res.json(
        toolRegistry
            .describe()
            .map(({ id, enabled, connected, error }) => ({ id, enabled, connected, error })),
    );
});

/** 插件列表：内置 + 自定义，带 source 区分 */
router.get('/', (_req, res) => {
    res.json(toolRegistry.describe());
});

/** 测试待添加的 MCP：连上列工具再断开，不落库 */
router.post('/test', async (req, res) => {
    try {
        res.json(await toolRegistry.testCustom(readManifest(req)));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(400).json({ error: message });
    }
});

/** 添加自定义 MCP：成功后立即连接并进入列表 */
router.post('/custom', async (req, res) => {
    try {
        res.json(await toolRegistry.addCustom(readManifest(req)));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(400).json({ error: message });
    }
});

/** 删除自定义 MCP；内置的会被拒绝 */
router.delete('/custom/:id', async (req, res) => {
    try {
        await toolRegistry.removeCustom(req.params.id);
        res.status(204).end();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(400).json({ error: message });
    }
});

/** 开关：服务端负责连接 / 断开，返回更新后的状态 */
router.post('/:id/enabled', async (req, res) => {
    const enabled = req.body?.enabled === true;

    try {
        res.json(await toolRegistry.setEnabled(req.params.id, enabled));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(404).json({ error: message });
    }
});

export default router;
