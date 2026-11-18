# Corpus 架构

本文档是项目的技术基线。**契约部分（第 5、6、7 节）是全项目最该先定死的东西**，实现可以后补，契约不要后改。

---

## 1. 定位与范围

**一句话**：一个可问、可查、有据的资料体。

**使用者权重**（决定了取舍方向）：
- 教学项目 40% —— 要学到 AI 应用的真东西
- 产品级准备 35% —— 即使只有一个人用，也要做好给别人用的准备
- 个人生产力工具 25% —— 在这个产品上调教出来

**由此得出的裁量原则**：

> 产品级只用在**改起来最贵**的地方：数据模型、接口契约、迁移、错误处理、评测。
> 可以糙的地方：UI 抛光、部署自动化、多平台适配、文档。

理由是可迁移性——契约设计和评测体系能带到下一个项目，拖拽排序和暗色主题不能。

---

## 2. 技术栈与选型理由

| 层 | 选型 | 理由 | 放弃的方案及原因 |
|---|---|---|---|
| 语言 | TypeScript | 全栈一套工具链，类型安全够用 | Python：前后端两套语言，RAG 逻辑与 UI 割裂 |
| 前端 | React + Vite | 生态成熟，渲染器组件好写 | — |
| 服务端 | Node.js 独立包 | **评测必须 headless 可跑**，这是硬约束 | 进程内嵌进 Electron：CI 跑评测要开窗口 |
| 桌面壳 | Electron（计划中，未实现） | 主进程可直接跑 Node server，没有 sidecar 生命周期 | Tauri：Rust 工具链 + sidecar 三条硬约束；2026-11 改 Electron |
| 存储 | SQLite（`node:sqlite`）+ FTS5 | 零安装、单文件、Node 内置 | Postgres+pgvector：私人场景不该要求装数据库；`better-sqlite3` 需按 Electron ABI rebuild |
| LLM | OpenAI 兼容 API | 一份配置覆盖绝大多数 provider | 逐家适配：无收益 |
| 扩展 | MCP（只依赖 tools） | 已有现成 server，不用自己发明协议 | 自研插件协议：重复劳动且无生态 |

### 关于桌面壳的明确认知

**RAG 逻辑始终在 TypeScript 里，桌面壳只替换外壳。** 性能收益在启动速度和内存占用，不在检索和生成。

0.1.0 先不做桌面壳：便携 zip（内置 `node.exe` + 启动器）已经能双击使用，验证产品价值不需要先付 Electron 的打包成本。详见 §3。

---

## 3. 进程与部署形态

核心思想：**本地与服务器是同一份代码，差异只在存储后端和认证。**

```
┌──────────────────────────────────────────────┐
│  Electron 主进程（计划中，未实现）             │
│   单实例锁 → 启动 server → 等 /healthz → 窗口 │
│   退出时关闭 server（同进程则随进程退出）     │
└───────────────────┬──────────────────────────┘
                    │ HTTP (localhost)
┌───────────────────▼──────────────────────────┐
│  Server（独立包，可 headless 运行）           │
│  会话 / 对话 / 流式 / 文件 / 索引 / 检索 /    │
│  引用 / 拒答 / SQLite / 迁移                  │
│  MCP client（query-time）                     │
│  Parser 注册表（ingest-time，静态）           │
└──────────────────────────────────────────────┘
```

### 为什么 server 必须是独立包

1. **评测要能在 CI 里 headless 跑**。长在桌面壳里就跑不了。
2. **本地与服务器共用同一份代码**。"本地也当服务器处理"这条判断才能落地。
3. **不依赖桌面壳**。Express + `node:sqlite` 都是普通 Node 能力，Electron 只是外壳。

### 0.1.0 的实际形态：便携 zip

- 目录：`node.exe` + `server.mjs`（rolldown 打成单文件）+ `web/` + `resources/`（prompts、plugins）+ `start.bat` + `launcher.mjs`
- `start.bat` → `launcher.mjs`：清旧端口文件 → 设 `CORPUS_WEB_DIR` / `CORPUS_RESOURCES_DIR` → `import('./server.mjs')` → 读 `CORPUS_PORT_FILE` → 打开浏览器
- 前端由 server 同源托管（`express.static` + SPA 回落），不需要单独的静态服务器
- 固定端口 8787；launcher 启动前扫描 8787–8807，结束占用端口的旧 Corpus 实例（别的程序占用时只报错，不误杀）
- 关掉命令行窗口即退出：launcher 不再“认领”后台旧实例，窗口里的进程就是唯一服务进程
- 不用 `pnpm`、不用 `node_modules`：server 已 bundle

### Electron 方案（下一步，未实现）

- 主进程直接 `import` server（同进程）或 child 启动；窗口 `loadURL('http://127.0.0.1:<port>/')`，保持同源
- 单实例：`app.requestSingleInstanceLock()`
- 资源路径：`process.resourcesPath`，通过 `CORPUS_RESOURCES_DIR` 传给 server
- **前置风险**：`node:sqlite` 在 Electron 内置的 Node 下是否可用，必须在写主进程之前验证；不可用则要换驱动

### 为什么不再用 Tauri

Tauri 需要 Rust 工具链，且 sidecar 有三条硬约束（命名带 target triple、`ExitRequested` 里手动 kill、`externalBin` 编译期声明）。Electron 的 Node 进程可以直接跑现有 server 代码，路径更短。

代价是体积：Electron 安装包约 100MB，便携版内置 `node.exe` 约 90MB。0.1.0 先用便携版验证产品，不引入 desktop 壳。

---

## 4. 分层

| 层 | 职责 | 可否冻结 |
|---|---|---|
| **契约层** | 数据类型、Host API、渲染描述、manifest | **v1.1 后冻结** |
| **核心层** | 会话、文件、索引、检索、生成、迁移 | 接口稳定，内部可优化 |
| **插件层** | parser（静态注册）、MCP server（动态配置） | 永远可变 |
| **壳层** | 进程托管、窗口、托盘 | 与核心解耦 |

---

## 5. 核心数据类型

```ts
// ── 溯源等级：决定检索权重，也决定什么能当"证据" ──────────
type Provenance =
  | 'user'    // 用户自己的笔记、方案、架构记录 —— 权重最高
  | 'doc'     // 用户导入的文档
  | 'web'     // 联网抓取的内容
  | 'model'   // 模型生成后沉淀的内容 —— 权重最低，且不得作为引用证据

// ── 文档 ──────────────────────────────────────────────
interface Document {
  id: string
  source: string                 // 哪个 collector / parser 产出的
  uri: string                    // 原始位置（本地路径或 URL），引用回跳用
  title: string
  provenance: Provenance
  createdAt: number
  meta: Record<string, unknown>  // 免费元数据：类型、大小、项目归属、标签
}

// ── 定位：引用溯源的地基，必须由 parser 产出 ─────────────
interface Locator {
  page?: number
  line?: [number, number]
  heading?: string
  charRange?: [number, number]
  url?: string
}

// ── 分块 ──────────────────────────────────────────────
interface Chunk {
  id: string
  docId: string
  text: string
  locator: Locator
  provenance: Provenance
  verified: boolean              // 是否经用户确认（model 来源必看）
  createdAt: number
  // 向量索引相关
  embeddingModel: string         // 见 §9，换模型的关键
  embeddingDim: number
}

// ── 引用：出现在答案里的每一条出处 ───────────────────────
interface Citation {
  chunkId: string
  docId: string
  title: string
  uri: string
  locator: Locator
  excerpt: string                // 原文片段，供用户核对
  provenance: Provenance
}

// ── 知识条目：用户显式沉淀的内容 ─────────────────────────
interface KnowledgeEntry {
  id: string
  question: string               // 当时的问题
  context: string                // 约束条件
  solution: string               // 方案
  alternatives?: string          // 放弃的方案
  tradeoffs?: string             // 权衡
  sourceSessionId?: string       // 来自哪次对话
  provenance: 'user'
  verified: boolean
  createdAt: number
}
```

**`KnowledgeEntry` 为什么是这个结构**：只存结论等于没存。这类"业务方案/架构决策"知识的半衰期是 5 年以上，但必须带上下文和放弃的方案才有参考价值。

---

## 6. Host API（唯一的插件契约）

插件不直接访问数据库、不直接读文件系统、不直接调 LLM。**只能通过这个对象。**

```ts
interface Host {
  // 数据
  queryKnowledge(search: string, opts?: {
    topK?: number
    provenance?: Provenance[]
  }): Promise<Chunk[]>

  listFiles(filter?: {
    type?: string
    project?: string
  }): Promise<FileMeta[]>

  readFile(id: string): Promise<Uint8Array>

  // 能力
  embed(texts: string[]): Promise<number[][]>
  llm(messages: Message[], opts?: { model?: string; maxTokens?: number }): Promise<string>

  // 观测
  log(level: 'info' | 'warn' | 'error', msg: string): void
}
```

### 三条铁律

1. **越窄越好**。这个接口越窄，核心越改得动。每加一个方法都要问"真的必须吗"。
2. **插件永远不直连 SQLite**。否则改 schema 就等于同时破坏所有插件，核心再也冻结不了。
3. **接口变更必须有 `apiVersion`**。代价一天，省的是"改一个字段全体插件崩"。

---

## 7. 插件系统

### 7.1 两种插件，不要混为一谈

| | ingest-time（摄取期） | query-time（查询期） |
|---|---|---|
| 何时跑 | 导入资料时 | 提问时 |
| 输入输出 | 来源 → `Document[]` | 参数 → 结果 |
| 例子 | Markdown 解析、PDF 解析、网页剪藏 | MDN 查询、DB 浏览、联网搜索 |
| 实现方式 | **静态注册表**（一个数组） | **MCP server**（动态配置） |
| 生命周期 | 随进程 | 可装可卸 |

**不要给 ingest-time 做热插拔**——它不需要，做了就是纯成本。

### 7.2 MCP 是唯一的 query-time 协议

```
不发明第二套插件协议。MCP 已经是协议了。
```

**只依赖 MCP 的 `tools`**，忽略 resources / prompts。理由：spec 演进速度不一，tools 是唯一稳定且所有 server 都实现的子集。

### 7.3 插件 manifest

```jsonc
{
  "id": "db-explorer",
  "name": "数据库浏览器",
  "version": "0.1.0",
  "apiVersion": 1,
  "transport": {
    "type": "http",                          // 或 "stdio"
    "url": "https://mcp.mdn.mozilla.net/"
  },
  "permissions": ["net", "fs:read"],         // 安装时展示
  "ui": {
    "slot": "drawer",                        // "drawer" | "panel" | "window"
    "render": "table"                        // 期望的渲染器
  }
}
```

### 7.4 权限模型

**不做沙箱**（本地个人场景性价比太低），但做**声明 + 审计**：
- 安装时展示所需权限
- 运行时记录：哪个插件调了什么、花了多少 token
- 成本约 0.5 人日，换"产品感"

---

## 8. 渲染器契约

**插件不画 UI**。插件产出结构化渲染描述，核心用内置渲染器画。

```ts
type RenderDescriptor =
  | { render: 'table'; columns: Column[]; rows: unknown[][] }
  | { render: 'tree'; nodes: TreeNode[] }
  | { render: 'files'; items: FileMeta[] }
  | { render: 'code'; language: string; code: string; startLine?: number }
  | { render: 'image'; src: string; alt?: string }
  | { render: 'markdown'; content: string }
```

### 为什么这样比"插件给组件"好

- 插件不需要懂前端框架（React 换了也不影响插件）
- 没有组件 API 的版本兼容问题
- 渲染器只有 6 个，能保证都好看
- 插件作者（未来的你）写起来极简单：返回一个 JSON

### 宿主形态：同一份视图，两种宿主

```
核心内置路由：/plugin-view/:pluginId
  ├─ drawer 宿主：主界面半屏抽屉
  ├─ panel  宿主：主界面内分栏 / 全屏面板
  └─ window 宿主：v1 不实现，留接口
```

"核心展示页面不允许被打破"因此是**结构上保证的**，不靠纪律——插件根本没机会画主对话区。

### 明确不做

- WebView / iframe 插件
- 插件自定义 CSS
- 插件注入 JS

一旦开这个口，就要做沙箱、CSP、进程隔离——一个月起步，且与 AI 无关。

---

## 9. 存储与迁移

### 9.1 表结构要点

```sql
-- 文件、文档、分块、会话、消息、知识条目、插件配置、迁移记录

-- 关键：向量索引与模型绑定
CREATE TABLE chunks (
  id            TEXT PRIMARY KEY,
  doc_id        TEXT NOT NULL REFERENCES documents(id),
  text          TEXT NOT NULL,
  locator       TEXT NOT NULL,       -- JSON
  provenance    TEXT NOT NULL,
  verified      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dim   INTEGER NOT NULL
);

-- 向量（sqlite-vec 虚拟表，语义检索启用后才建）
CREATE VIRTUAL TABLE chunk_vec USING vec0(
  chunk_id TEXT PRIMARY KEY,
  embedding FLOAT[1024]
);
```

### 9.2 embedding 模型升级路径 ⚠️ 最高优先级

**这是 RAG 项目最经典的锁死陷阱**：换 embedding 模型 = 所有向量失效 = 全量重建索引。

很多人做到一半发现模型不行，想换，结果要重灌几万条数据，于是放弃，卡死在次优模型上。

**从一开始就要防**：
- 每个 chunk 记录 `embedding_model` + `embedding_dim`
- 支持**多索引并存**（旧模型索引保留，新模型建新索引）
- 支持**后台重建**，带进度
- 检索时按当前配置的模型选索引

成本约 3 人日，换的是"项目不会卡死"。

### 9.3 迁移

- **用 migration 文件**，不用 `CREATE TABLE IF NOT EXISTS`
- 迁移前**自动备份**数据库文件
- **必须可回滚**（本地库是几个月积累，一次失败的迁移就没了）
- 迁移的自动化测试：旧库升级 → 数据完整 → 回滚成功

### 9.4 数据目录

```
%APPDATA%\Corpus\
├─ corpus.db          # 主库
├─ corpus.db.backup   # 迁移前备份
├─ files/             # 原始文件
├─ logs/              # 结构化日志
└─ config.json        # 用户配置（key 加密，见 §11）
```

**发布后这个路径改不动**（改了等于丢数据），所以一开始就要定死。

### 9.5 规模上限

SQLite + FTS5（0.1.0 实际使用的）在 **10 万 chunk** 量级表现良好，**100 万级**开始吃力（全表扫描 + 内存）。将来加向量检索时，`sqlite-vec` 也在同一量级。

架构文档里写清楚这条：**超过上限则换存储后端**（pgvector / 分层索引）。现在不做，但要知道天花板在哪。

---

## 10. 检索与生成流水线

### 10.1 ingest 链路

```
来源 → Collector → Parser（text + locatorMap）→ Chunker → Embedder → Index
```

**Parser 必须返回定位信息，不能只返回纯文本**：

```ts
interface ParseResult {
  text: string
  locatorMap: Array<{
    charRange: [number, number]   // 在 text 中的区间
    locator: Locator              // 在原始文档中的位置
  }>
}
```

如果第一个 parser 只吐 `string`，后面想做"点引用跳回 PDF 第 7 页"就得重写整条摄取管道并重建索引。**这个契约第一天就要做对。**

### 10.2 query 链路（v1：链式 RAG）

```
问题 → [可选] query 改写 → 混合检索（向量 + BM25）→ [可选] rerank
     → 信任过滤（model 来源降权/排除引用栏）
     → 提示词组装（含引用格式要求）
     → 拒答判定
     → 流式生成 + 引用挂载
```

**0.1.0 实际只有关键词这一路**：`getEmbedder()` 返回 `null`，检索走 FTS5 + 覆盖率闸门；query 改写、rerank、信任过滤都还没接。上图是目标形态，不是现状。

### 10.3 拒答判定

两条路径，都要实现：

1. **检索层**：top-1 相似度低于阈值 → 直接回"资料里没有"
2. **生成层**：提示词要求模型只依据给定片段，无法回答时输出固定标记 → 转换为用户话术

阈值需要评测集来调——这又回到"评测不能砍"。

### 10.4 自我污染防护 ⚠️

冷启动时库是空的，只能靠模型 + 联网。把那些答案存起来有价值，但**直接入库会制造回音室**：

```
幻觉 → 存为文档 → 下次检索召回 → 变成"证据" → 更自信的错 → 再存
```

**三条防护**：
1. 每条 chunk 带 `provenance` 和 `verified`
2. **`model` 来源的内容永远不出现在"根据资料"引用栏**，只能作为"上次的讨论"提示
3. **会话历史 ≠ 知识库**：会话完整记录但**不参与检索**；只有用户显式"存为知识"才进索引

**这个功能延后到评测体系之后**（M9+），因为要先能测出"检索变差了"才有资格往索引里塞东西。

### 10.5 中断与取消

流式生成时用户切会话 / 点停止 / 关面板，必须 abort 上游请求。否则：继续扣 token、继续写库、后台堆积请求。

---

## 11. 安全与密钥

- **0.1.0 现状**：API Key **明文存 `settings` 表**（`llm.apiKey`）。服务只绑 `127.0.0.1`、仅本机使用，风险与明文 `.env` 相当
- **key 永远不出 server 进程**：`GET /api/settings/llm` 只回 `hasApiKey`，任何接口都不回显；日志不记录 key
- **开发用 `.env`**，界面配置 **优先于** `.env`，且 `.env` 只在非 production 读取
- 配置模型：`{ baseUrl, model, apiKey }`，只支持 OpenAI 兼容格式
- **计划**：Electron 阶段用 `safeStorage`（OS 级加密）保存 key；在此之前文档不宣称“加密存储”

---

## 12. 约束清单（明确不做的事）

写下来，否则这些会悄悄吃掉一半工期：

| 不做 | 原因 |
|---|---|
| 插件沙箱 | 插件是可信代码；"本地也当服务器"意味着后端全链路可信 |
| 动态插件发现（扫目录加载） | 静态注册表够用，加加载器是纯成本 |
| 插件贡献 UI 组件 | 见 §8，用渲染描述替代 |
| 插件直连数据库 | 见 §6，核心将永远冻结不了 |
| 多租户 / 权限体系 | 教学项目不碰，会吃掉 60% 时间且与 AI 无关 |
| WebView 插件 | 需要沙箱、CSP，一个月起步 |
| 插件市场 / 生态 | 插件只服务自己 |
| 自动化测试覆盖率 / E2E | 评测集是标尺，覆盖率是仪式 |

---

## 13. 风险登记

| # | 风险 | 影响 | 缓解 | 处理时机 |
|---|---|---|---|---|
| 1 | **embedding 模型锁死** | 换模型要全量重建，可能直接放弃 | chunk 记录模型/维度 + 多索引并存 | **M2 就做** |
| 2 | **自我污染** | 知识库越来越自信地错 | provenance + verified + 会话不入索引 | M9 |
| 3 | **核心冻结过早** | 插件扭曲架构补核心缺陷 | 先跑通 3 个真实插件再冻结 | v1.0 后 |
| 4 | **评测被砍** | 调参全靠感觉，改动方向不明 | 缩到 30 条 + 一个脚本（2 人日） | **M7 必做** |
| 5 | **范围失控** | 200 人日也做不完 | 产品级只限数据层/契约层；UI 只到"顺畅" | 全程 |
| 6 | **插件系统吃掉 AI 深度** | 变成在做框架而不是 AI 应用 | 静态注册 + 不做沙箱 | 全程 |
| 7 | **规模天花板** | 超过 10 万 chunk 后变慢 | 文档里写清上限与迁移方案 | 记录即可 |
| 8 | **首次启动下载 embedding 模型** | 用户体验差 | 进度条 + 断点续传 + 校验（2~3 人日） | M11 |
| 9 | **Electron 里 `node:sqlite` 不可用** | 打包方案要换存储驱动 | 写主进程之前先验证 | M11 |
| 11 | **多实例抢数据库** | 后开的实例写不进去（readonly） | launcher 单实例认领 + 启动写探针（已做） | 0.1.0 |
| 10 | **PDF 解析低估** | 表格/双栏/扫描件无底洞 | 不做版面分析，先按页提文本 | M6 |

---

## 14. 决策记录（为什么不是另一个方案）

| 决策 | 选择 | 放弃的方案 | 理由 |
|---|---|---|---|
| 本地形态 | localhost 服务 | 直接读写本地文件的函数 | 团队版可复用同一条代码路径 |
| 服务端进程 | 独立 Node 包 | 进程内嵌进壳 | 评测必须 headless 可跑 |
| 桌面壳 | Electron（2026-11 由 Tauri 改） | Tauri | 主进程可直接跑现有 Node server，省掉 Rust 与 sidecar 生命周期 |
| 插件协议 | MCP | 自研协议 | 已有现成 server，不重复造 |
| UI 扩展 | 渲染描述 + 内生渲染器 | 插件给组件 / WebView | 避免前端被插件绑架 |
| 分块策略 | 配置项（枚举） | 插件 | 过度设计，教学项目不需要 |
| 桌面壳时机 | 最后一个里程碑 | 最先做 | 先做会浪费两周调打包，那时还没有 RAG |
| 团队部署 | 同核心换后端 | 独立产品 | 差异只有存储/认证/并发，不该两套代码 |
| **embedding** | **API**（OpenAI 兼容） | 本地模型 | 快、便宜，且 §9.2 已保证换模型不必重建数据，选哪个都不锁死 |
| **团队抽象层** | **v1 不预留** | 提前抽象 DAO | 私人和团队后端做的事一样，差异只在用户校验和权限，将来加即可 |
| **联网检索** | **搜索 API** | 自建抓取 | 自建要处理反爬/清洗/限流/站点改版，一周起步且随时失效 |
| **教学笔记** | **只记坑** | 完整教程 | 时间成本；坑是唯一过后会忘的东西 |
| **前端 HTTP 客户端** | **原生 fetch**（`utils/request.ts`） | axios | 对话流式必须拿到增量，axios 走 XHR 拿不到，只能再开一条 fetch 通道——两套客户端就是两套超时、错误处理和 baseURL。而超时、错误归一、baseURL 拼接本来就自己封装，几十行的事，不值得为它引依赖 |

---

## 15. 附录：embedding 是什么（教学用）

**一句话**：把一段文字变成一串数字，从而把"意思相近"变成"数字距离近"。

### 它长什么样

```
"退款流程是什么"  → [0.021, -0.113, 0.087, …… ]   1536 个数
"怎么申请退货"    → [0.019, -0.108, 0.091, …… ]   1536 个数
"今天天气不错"    → [-0.442, 0.301, 0.765, …… ]   1536 个数

前两句字面没有共同词，但向量距离很近；
第三句离它们很远。
```

**检索 = 把问题也变成向量，然后找库里距离最近的几个 chunk。**

### 三个必须知道的性质

1. **它不是生成模型。** embedding 模型只做「文字 → 向量」，不会说话。生成由另一个模型完成。RAG 里两者分工明确。
2. **不同模型的向量互不兼容。** `text-embedding-3-small` 是 1536 维，`bge-m3` 是 1024 维；即使维度恰好相同，两个模型所处的"空间"也完全不同。**混用 = 结果全是垃圾。**
3. **成本极低，但按条收费。** embedding 比生成便宜两个数量级，可以大胆用；但 1000 个 chunk 就是 1000 条请求，**必须批量提交**。

### 在本项目里的位置

```
入库：文件 → 分块 → 每块调 embedding → 存进 sqlite-vec
提问：问题 → 调 embedding → 在 sqlite-vec 里找最近的 N 个 chunk
```

### 维度是真实的成本

1536 维 float32 ≈ 每块 **6 KB**：

| chunk 数 | 向量占用 |
|---|---|
| 1 万 | ~60 MB |
| 10 万 | ~600 MB |

这是 §9.5「10 万 chunk 是舒适区上限」的原因之一。

### 为什么 §9.2 要求记录 `embedding_model`

因为换模型 = 旧向量全部作废。记录了这个字段，才知道哪些 chunk 需要重建、哪些旧索引还能继续用。

### 常见的坑

- **维度写错**：`vec0` 表声明的 dim 与模型实际输出不一致时，插入会**静默失败**或报莫名其妙的错。
- **忘了批量**：逐条调用会被限流，且慢 10 倍以上。
- **拿模型 A 的库去查模型 B**：不报错，但结果全是噪音——比报错更危险。
