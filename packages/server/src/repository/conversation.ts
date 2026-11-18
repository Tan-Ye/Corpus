import type { ChatMessage, Conversation } from '@corpus/core/types';

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

interface MessageRow {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    citations: string | null;
    stopped: number;
}

/**
 * 聊天消息列表。
 * citations 以 JSON 存储，读出来反序列化回结构；坏数据当作没有引用，不抛错。
 */
export function listChatMessages(conversationId: string): ChatMessage[] {
    const rows = db
        .prepare(
            `SELECT id, role, content, citations, stopped
               FROM messages
              WHERE conversation_id = ? AND deleted_at IS NULL
              ORDER BY seq ASC`,
        )
        .all(conversationId) as unknown as MessageRow[];

    return rows.map((row) => {
        const message: ChatMessage = {
            id: row.id,
            role: row.role,
            content: row.content,
        };

        if (row.citations) {
            try {
                message.citations = JSON.parse(row.citations) as ChatMessage['citations'];
            } catch {
                // 历史数据坏了就当没有引用，不能因此让整个会话打不开
            }
        }

        if (row.stopped === 1) {
            message.stopped = true;
        }

        return message;
    });
}

/**
 * 会话重命名
 */
export function renameConversation(id: string, title: string): boolean {
    const result = db
        .prepare(`UPDATE conversations SET title = ? WHERE id = ? AND deleted_at IS NULL`)
        .run(title, id);

    return Number(result.changes) > 0;
}

export interface ConversationSearchHit extends Conversation {
    /** 命中的消息片段（标题命中时为 null） */
    snippet: string | null;
}

/** SQLite LIKE 里的通配符要转义，否则用户输入 % 会匹配全部 */
function escapeLike(value: string): string {
    return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

/**
 * 会话搜索：标题或消息内容任一命中。
 * 返回的 snippet 用来在前端展示"为什么这条会话匹配"。
 */
export function searchConversations(query: string, limit = 30): ConversationSearchHit[] {
    const term = escapeLike(query.trim());

    if (!term) {
        return [];
    }

    const pattern = `%${term}%`;
    const rows = db
        .prepare(
            `SELECT c.id,
                    c.title,
                    c.updated_at AS updatedAt,
                    (SELECT m.content
                       FROM messages m
                      WHERE m.conversation_id = c.id
                        AND m.deleted_at IS NULL
                        AND m.content LIKE ? ESCAPE '\\'
                      ORDER BY m.seq DESC
                      LIMIT 1) AS snippet
               FROM conversations c
              WHERE c.deleted_at IS NULL
                AND (c.title LIKE ? ESCAPE '\\'
                     OR EXISTS (SELECT 1
                                  FROM messages m2
                                 WHERE m2.conversation_id = c.id
                                   AND m2.deleted_at IS NULL
                                   AND m2.content LIKE ? ESCAPE '\\'))
              ORDER BY c.updated_at DESC
              LIMIT ?`,
        )
        .all(pattern, pattern, pattern, limit) as unknown as ConversationSearchHit[];

    return rows.map((row) => ({ ...row, snippet: row.snippet ?? null }));
}
