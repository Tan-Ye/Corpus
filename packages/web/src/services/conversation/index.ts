import { del, get, post } from '@/utils/request';
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
