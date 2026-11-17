import { Router } from 'express';

import {
    deleteConversation,
    listChatMessages,
    listConversations,
    renameConversation,
} from '../repository';

const router = Router();

/** 会话列表（不含已软删除的） */
router.get('/', (_req, res) => {
    const conversations = listConversations();
    res.json(conversations);
});

/** 某个会话的历史消息，按写入顺序 */
router.get('/:id', (req, res) => {
    res.json(listChatMessages(req.params.id));
});

/**
 * 会话重命名
 */
router.post('/rename', (req, res) => {
    const { id, title } = req.body;
    res.json(renameConversation(id, title));
});

/** 删除会话：软删会话本身，它的日志一并清掉 */
router.delete('/:id', (req, res) => {
    deleteConversation(req.params.id);
    res.status(204).end();
});

export default router;
