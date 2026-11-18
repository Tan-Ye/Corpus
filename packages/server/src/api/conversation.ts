import { Router } from 'express';

import { llmStream } from '@corpus/core';

import { buildHandoffMessages } from '../handoff';
import {
    deleteConversation,
    listChatMessages,
    listConversations,
    renameConversation,
    searchConversations,
} from '../repository';
import { streamFrames } from '../utils';

const router = Router();

const MAX_TITLE_LENGTH = 100;

/** 会话列表（不含已软删除的） */
router.get('/', (_req, res) => {
    res.json(listConversations());
});

/** 会话搜索：标题或消息内容命中；放在 /:id 前面，否则会被当成 id */
router.get('/search', (req, res) => {
    const query = String(req.query.q ?? '').trim();

    if (!query) {
        res.json([]);
        return;
    }

    res.json(searchConversations(query));
});

/** 某个会话的历史消息，按写入顺序 */
router.get('/:id', (req, res) => {
    res.json(listChatMessages(req.params.id));
});

/** 重命名：标题非空且不超过 100 字 */
router.patch('/:id', (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';

    if (!title) {
        res.status(400).json({ error: '标题不能为空' });
        return;
    }

    if (title.length > MAX_TITLE_LENGTH) {
        res.status(400).json({ error: `标题不能超过 ${MAX_TITLE_LENGTH} 个字` });
        return;
    }

    if (!renameConversation(req.params.id, title)) {
        res.status(404).json({ error: '会话不存在' });
        return;
    }

    res.json({ id: req.params.id, title });
});

/**
 * 生成交接摘要：把整段会话压缩成一份可以带进新会话的摘要。
 *
 * 上下文快满的时候用它——比让用户自己复述一遍可靠。
 */
router.post('/:id/handoff', async (req, res) => {
    const history = listChatMessages(req.params.id);

    if (history.length === 0) {
        res.status(400).json({ error: '这个会话还没有内容，无法生成交接摘要' });
        return;
    }

    try {
        const stream = await llmStream(buildHandoffMessages(history), {});

        let summary = '';

        for await (const frame of streamFrames(stream)) {
            if (frame.type === 'text') {
                summary += frame.text;
            }
        }

        if (!summary.trim()) {
            res.status(502).json({ error: '模型没有返回摘要内容，请重试' });
            return;
        }

        res.json({ summary: summary.trim(), messageCount: history.length });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(502).json({ error: message });
    }
});

/** 删除会话：软删会话本身，它的日志一并清掉 */
router.delete('/:id', (req, res) => {
    deleteConversation(req.params.id);
    res.status(204).end();
});

export default router;
