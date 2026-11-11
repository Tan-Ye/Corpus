import type { ChatMessage, Conversation } from '@/types/chat'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

const now = Date.now()

/** 布局阶段的占位数据，接后端后整个文件删掉 */
export const DEMO_CONVERSATIONS: Conversation[] = [
  { id: 'c1', title: '为什么选 SQLite 而不是 Postgres', updatedAt: now - 12 * MINUTE },
  { id: 'c2', title: '引用定位是怎么算出来的', updatedAt: now - 3 * HOUR },
  { id: 'c3', title: '拒答阈值和评测集的关系', updatedAt: now - 26 * HOUR },
  { id: 'c4', title: 'MCP 插件要支持哪些能力', updatedAt: now - 30 * HOUR },
  { id: 'c5', title: 'Tauri sidecar 的进程回收', updatedAt: now - 5 * 24 * HOUR },
]

export const DEMO_MESSAGES: ChatMessage[] = [
  {
    id: 'm1',
    role: 'user',
    content: '为什么我们的存储选了 SQLite 而不是 Postgres？',
  },
  {
    id: 'm2',
    role: 'assistant',
    content:
      '因为这是私人场景，不该要求先装一个数据库。SQLite 是单文件、零安装，整个库可以直接备份带走[1]；Postgres 加 pgvector 能力更强，但要额外维护一个服务，对一个人用的场景是纯成本。\n\n代价是规模天花板：10 万 chunk 量级表现良好，100 万级开始吃力[2]。',
    citations: [
      {
        id: 'ct1',
        title: 'architecture.md',
        locator: '§2',
        excerpt:
          '存储选 SQLite + sqlite-vec：零安装、单文件、可整体备份带走。放弃 Postgres+pgvector：私人场景不该要求装数据库。',
        provenance: 'doc',
      },
      {
        id: 'ct2',
        title: 'architecture.md',
        locator: '§9.5',
        excerpt:
          'SQLite + sqlite-vec 在 10 万 chunk 量级表现良好，100 万级开始吃力（全表扫描 + 内存）。超过上限则换存储后端。',
        provenance: 'doc',
      },
    ],
  },
]

export const SUGGESTIONS: string[] = [
  '这个项目的技术栈是什么？',
  '为什么核心要冻结得晚一点？',
  '评测集应该包含哪些类型的问题？',
]
