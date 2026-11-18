import { del, get, patch, post } from '@/utils/request';
import type { Conversation } from '@corpus/core/types';

/**
 * 获取所有会话
 * @returns 会话列表
 */
export function getConversations(): Promise<Conversation[]> {
    return get<Conversation[]>('/conversation');
}

/**
 * 创建会话
 * @param name 会话名称
 * @returns 会话
 */
export function createConversation(name: string): Promise<Conversation> {
    return post<Conversation>('/conversation', { name });
}

/** 删除会话：服务端软删会话，并清掉它的日志 */
export function deleteConversation(id: string): Promise<void> {
    return del<void>(`/conversation/${id}`);
}

export interface ConversationSearchHit extends Conversation {
    /** 命中的消息片段；标题命中时为 null */
    snippet: string | null;
}

/** 重命名会话；标题非空、不超过 100 字由服务端校验 */
export function renameConversation(id: string, title: string): Promise<{ id: string; title: string }> {
    return patch<{ id: string; title: string }>(`/conversation/${id}`, { title });
}

/** 会话搜索：标题或消息正文命中 */
export function searchConversations(query: string): Promise<ConversationSearchHit[]> {
    return get<ConversationSearchHit[]>(`/conversation/search?q=${encodeURIComponent(query)}`);
}

export interface HandoffResult {
    summary: string;
    messageCount: number;
}

/** 生成交接摘要：把整段会话压成一份可以带进新会话的说明 */
export function requestHandoff(id: string): Promise<HandoffResult> {
    return post<HandoffResult>(`/conversation/${id}/handoff`, undefined, { timeout: 120_000 });
}
