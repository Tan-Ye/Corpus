import { Router } from 'express';

import { toolRegistry } from '../mcp';

const router = Router();

/** 工具清单 + 加载失败的插件（不用翻日志就知道谁没起来） */
router.get('/', (_req, res) => {
    res.json({
        tools: toolRegistry.list(),
        failures: toolRegistry.failures(),
    });
});

/** 调工具：body 直接就是参数，例如 { "query": "container queries" } */
router.post('/:name', async (req, res) => {
    const args = (req.body?.args ?? req.body ?? {}) as Record<string, unknown>;

    try {
        res.json(await toolRegistry.call(req.params.name, args));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(502).json({ error: message });
    }
});

export default router;
