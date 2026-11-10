// 集中定义的常量：改名只改这里（AGENTS.md §1）
export const APP_NAME = 'Corpus'
export const APP_NAME_ZH = '' // 空则界面用 APP_NAME

// model 与 dim 必须成对改，且要和 sqlite-vec 建表时的 FLOAT[dim] 一致（M2）
export const EMBEDDING = {
  model: 'text-embedding-3-small',
  dim: 1536,
} as const
