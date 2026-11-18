/** 引用片段：M4 接检索后由后端给出，现在前端先按这个形状占位 */
export interface Citation {
    id: string;
    /** 来源文档 id：用它打开原文 */
    documentId?: string;
    /** 文档名，追溯用 */
    title: string;
    /** 定位：章节 / 页码 / 行号 */
    locator: string;
    /** 命中片段在 markdown 里的行范围，打开原文时用来定位 */
    startLine?: number;
    endLine?: number;
    /** 摘要：界面上展示的原文片段 */
    excerpt?: string;
    /**
     * 完整原文块，只用于注入提示词。
     * 不能和 excerpt 合并：界面只要两行摘要，模型需要整段才能答完整。
     */
    content?: string;
    /** 溯源等级，决定这条能不能当证据 */
    provenance?: 'user' | 'doc' | 'web' | 'model';
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    citations?: Citation[];
    /** 生成被用户中断：历史里也要能看出来 */
    stopped?: boolean;
}

export interface Message {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    toolCalls?: ToolCall[]; // assistant 发出调用时带
    toolCallId?: string; // tool 回填结果时带
}

export interface ChatSendRequest {
    messages: Message[];
    /** 不传表示新会话，服务端会生成一个，并作为第一帧 created 返回 */
    conversationId?: string;
    /** 是否先用本地文档库做检索注入（内置功能「文档检索」开着时为 true） */
    useRetrieval?: boolean;
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
    | { type: 'error'; message: string }
    /** 非致命提醒：上下文被截断、建议新开会话等 */
    | { type: 'notice'; level: 'info' | 'warn'; message: string }
    /** 本轮用到的参考资料，前端据此渲染出处；顺序对应正文里的 [n] */
    | { type: 'sources'; citations: Citation[] }
    | { type: 'tool'; name: string; status: 'start' | 'end'; ok?: boolean };

// 工具描述：MCP 的 inputSchema 清洗后就是它
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: unknown; // JSON Schema
}

// 模型请求调用某个工具
export interface ToolCall {
    id: string; // 模型给的 id，tool 消息要回填
    name: string; // mdn__search
    arguments: Record<string, unknown>; // 已解析
}
