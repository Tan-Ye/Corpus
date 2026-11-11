/** 引用片段：M4 接检索后由后端给出，现在前端先按这个形状占位 */
export interface Citation {
  id: string
  /** 文档名，追溯用 */
  title: string
  /** 定位：章节 / 页码 / 行号 */
  locator: string
  /** 原文逐字片段，供核对；必须是原文，不能是模型改写 */
  excerpt?: string
  /** 溯源等级，决定这条能不能当证据 */
  provenance?: 'user' | 'doc' | 'web' | 'model'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
}

export interface Conversation {
  id: string
  title: string
  updatedAt: number
}
