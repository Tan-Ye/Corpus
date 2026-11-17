import type { Conversation, ChatMessage } from '@corpus/core/types';

import { db } from '../db';

/**
 * 会话列表
 */
export function listConversations(): Conversation[] {
    return db
        .prepare(
            `SELECT id, title, updated_at AS updatedAt FROM conversations WHERE deleted_at IS NULL ORDER BY updated_at DESC`,
        )
        .all() as unknown as Conversation[];
}

/**
 * 会话删除（软删）：会话本身打删除标记，它的日志直接清掉，
 * 免得日志列表里留下没有主人的记录。
 */
export function deleteConversation(id: string): void {
    db.prepare(`UPDATE conversations SET deleted_at = ? WHERE id = ?`).run(Date.now(), id);
    db.prepare('DELETE FROM logs WHERE conversation_id = ?').run(id);
}

/** 已存在就不动，新会话才插入；消息发送前调用 */
export function ensureConversation(id: string, title: string): void {
    const now = Date.now();
    db.prepare(
        `INSERT INTO conversations (id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
    ).run(id, title, now, now);
}

/**
 * 聊天消息列表
 */
export function listChatMessages(conversationId: string) {
    return db
        .prepare(
            `SELECT
            id, role, content
            FROM messages
            WHERE conversation_id = ? AND deleted_at IS NULL
            ORDER BY seq ASC`,
        )
        .all(conversationId) as unknown as ChatMessage[];
}

/**
 * 会话重命名
 */
export function renameConversation(id: string, title: string): void {
    db.prepare(`UPDATE conversations SET title = ? WHERE id = ?`).run(title, id);
}
