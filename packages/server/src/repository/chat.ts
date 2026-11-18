import type { Citation } from '@corpus/core/types';

import { db } from '../db';

interface AppendMessageInput {
    id: string;
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    /** 只对助手消息有意义：本轮用到的参考资料，落库后才能刷新回看 */
    citations?: Citation[];
    /** 生成被用户中断 */
    stopped?: boolean;
}

/**
 * 追加聊天消息。
 *
 * citations 以 JSON 存一列：引用结构简单、只读，拆表不值得。
 */
export function appendMessage(input: AppendMessageInput): void {
    db.prepare(
        `INSERT INTO messages (id, conversation_id, role, content, citations, stopped, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        input.id,
        input.conversationId,
        input.role,
        input.content,
        input.citations && input.citations.length > 0 ? JSON.stringify(input.citations) : null,
        input.stopped ? 1 : 0,
        Date.now(),
    );
}
