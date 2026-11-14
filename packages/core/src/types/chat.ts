/** 引用片段：M4 接检索后由后端给出，现在前端先按这个形状占位 */
export interface Citation {
    id: string;
    /** 文档名，追溯用 */
    title: string;
    /** 定位：章节 / 页码 / 行号 */
    locator: string;
    /** 原文逐字片段，供核对；必须是原文，不能是模型改写 */
    excerpt?: string;
    /** 溯源等级，决定这条能不能当证据 */
    provenance?: 'user' | 'doc' | 'web' | 'model';
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    citations?: Citation[];
}

export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface ChatSendRequest {
    messages: Message[];
    /** 不传表示新会话，服务端会生成一个，并作为第一帧 created 返回 */
    conversationId?: string;
}

/**
 * SSE 帧。前端按 type 分支处理，不要靠"有没有某个字段"猜。
 *
 * created → text* → done
 * created → text* → stopped   （用户点了停止）
 * created → text* → error     （上游中途失败）
 */
export type StreamFrame =
    | { type: 'created'; conversationId: string }
    | { type: 'text'; text: string }
    | { type: 'done' }
    | { type: 'stopped' }
    | { type: 'error'; message: string };
