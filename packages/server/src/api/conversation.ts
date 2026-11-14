import { Router } from 'express';

import { listChatMessages, listConversations } from '../repository';

const router = Router();

/** 会话列表（不含已软删除的） */
router.get('/', (_req, res) => {
    console.log('listConversations');
    const conversations = listConversations();
    res.json(conversations);
});

/** 某个会话的历史消息，按写入顺序 */
router.get('/:id', (req, res) => {
    res.json(listChatMessages(req.params.id));
});

export default router;
