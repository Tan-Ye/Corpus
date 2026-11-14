import { get, post } from '@/utils/request';
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
