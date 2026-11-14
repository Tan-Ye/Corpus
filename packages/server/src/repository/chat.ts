import { db } from '../db';

interface AppendMessageInput {
    id: string;
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
}

/**
 * 追加聊天消息
 */
export function appendMessage(input: AppendMessageInput): void {
    db.prepare(
        `INSERT INTO messages (id, conversation_id, role, content, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ).run(input.id, input.conversationId, input.role, input.content, Date.now());
}
