import type { ChatMessage, ChatSendRequest } from '@corpus/core/types';
import { get, post, requestStream } from '@/utils/request';

/**
 * 发送消息。返回流式输出
 * @param request
 * @returns
 */
export function sendChat(request: ChatSendRequest) {
    return requestStream('/chat/send', { method: 'POST', body: request });
}

/**
 * 获取会话详情(会话聊天记录)
 * @param id 会话ID
 * @returns 会话详情
 */
export function getChatHistory(id: string): Promise<ChatMessage[]> {
    return get<ChatMessage[]>(`/conversation/${id}`);
}

/**
 * 停止llm流输出
 * @param id 会话ID
 * @returns 服务端回 204，没有响应体
 */
export function stopChat(id: string): Promise<void> {
    return post<void>(`/chat/stop/${id}`);
}
