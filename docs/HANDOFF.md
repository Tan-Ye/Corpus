# Corpus 会话交接

> 最后更新：2026-11-17 · 对应版本 0.1.0
>
> 阅读顺序建议：本文件 → `AGENTS.md`（项目约定与硬规则）→ `docs/architecture.md`（契约与决策）

---

## 0. 一句话现状

**0.1.0 第一阶段完成**：上传文档（md/txt/docx/pdf）→ 解析切块 → **按需检索**（模型调用内置工具 `search_documents`）→ 带引用的回答 → 右侧「本次引用」面板可打开原文并高亮；工具查不到时模型明说「资料里没有」；MCP 工具已接入；模型在界面里配置；Electron 开发态可启动。
**缺的是**：评测集（**2026-11-18 拍板推迟到二期**）、语义检索、联网检索、工具结果进引用、Electron 安装包（`pnpm build` 尚未验证）。

---

## 1. 当前进度 vs 路线图（M0~M11）

| # | 里程碑 | 状态 | 说明 |
|---|---|---|---|
| M0 | 骨架 + 裸流式对话 | ✅ 完成 | SSE、中断、持久化 |
| M1 | 契约定义 | ⚠️ 部分 | `chat`/`docs`/`Citation` 已定；`Host`/`RenderDescriptor` 未做（插件改用 MCP） |
| M2 | 文件入库 + 解析 + 索引 | ✅ 完成 | 解析/分块/存储/去重；`embedding_model`/`dim` 已落库，当前写 `keyword-only` |
| M3 | 混合检索 | ⚠️ 部分 | 关键词（BM25 + 覆盖率闸门）完成；向量与混合打分待 embedding |
| M4 | RAG 回答 + 引用 + 拒答 | ✅ 完成 | 含引用落库、`[n]` 跳转、查看原文；检索改为按需工具，拒答由工具空结果承担 |
| M5 | 聊天 UI 完整化 | ✅ 基本完成 | 多会话、重命名、搜索、删除弹窗、上传设置、日志、DB 浏览、右侧引用面板 |
| M6 | PDF 解析 | ✅ 完成 | 结构识别（编/章/节/条）、条目分段、行号定位 |
| M7 | 评测体系 | ❌ 未做 | 用户暂缓；0.1.0 靠人工验证 |
| M8 | 联网检索 | ❌ 未开始 | 与"工具结果进引用"同一套机制，建议合并做 |
| M9 | MCP 接入 | ✅ 完成 | Context7 / DeepWiki / MDN + 自定义，工具循环 + 白名单 |
| M10 | 对话即摄取 + 信任分级 | ❌ 未开始 | `provenance` 字段已预留 |
| M11 | 打包分发 | ⚠️ 部分 | **Electron 45 开发态可启动**（`pnpm dev`）；`electron-builder.yml` 已就绪，**安装包打包未验证**（原计划 Tauri，2026-11 改为 Electron） |

---

## 2. 已完成的功能（按模块）

### 2.1 对话与流式

- SSE 帧类型：`created | text | tool | sources | notice | done | stopped | error`
- 工具循环：最多 3 轮，超过后进入"强制作答"轮（不带 tools），空回答转 error
- 停止：`POST /api/chat/stop/:id`，中断后保存部分回答并标记 `stopped`
- 持久化：用户消息与助手消息都落库；助手消息带 `citations`（JSON）和 `stopped`
- 历史加载：`GET /api/conversation/:id` 返回带引用的完整消息

### 2.2 检索与引用

- 按需检索：模型通过内置工具 `search_documents` 主动调用，**不再每轮自动检索**
- 工具描述动态列出所有文档（标题 + 用途描述），模型按用途判断该查哪篇
- 关键词检索：FTS5（`unicode61`）+ 手写 tokenizer（拉丁词 + 中文二元组）
- 打分：`score = 查询词覆盖率 × BM25 相对分`，阈值 `0.25`
- 工具返回空 → 提示模型「资料里没有」，由模型明说；**不再有拒答短路**
- 引用结构：`id/documentId/title/locator/startLine/endLine/excerpt/content/provenance`
- 前端：正文 `[n]` 上标 → 滚动到出处；宽屏右侧「本次引用」面板常驻（`xl`），窄屏用消息下方列表
- 查看原文：`GET /api/documents/:id/content?start=&end=` 按行返回 markdown，弹窗高亮
- 检索日志：`logs.type='retrieval'`，记录 query / hits / 是否拒答 / 耗时
- **默认开启**：文档库与文档检索默认打开（`features.ts` 的 `defaultEnabled`），数据库/日志/MCP 默认关

### 2.3 文档入库

- 格式：Markdown、纯文本、Word（.docx，零依赖自写 zip 解析）、PDF（`unpdf`）
- PDF 预处理（`utils/docs/pdf-structure.ts`）：私用区字符清理、断行合并、`第X编/章/节` → 标题、`第X条` → 段落边界、`【字段】` 独立成段、目录标签丢弃
- 分块：按标题切节 → 段落聚合（上限 480 字）→ 硬切优先落在 `。！？；` → 相邻块重叠 80 字
- 行号：每块独立计算 `startLine/endLine`
- 过滤：少于 10 字的噪声块丢弃（全是碎块时不过滤）
- 去重：内容 sha256，命中直接返回已有文档
- 重建索引：`POST /api/documents/reindex`，按磁盘 markdown 重跑，事务内替换 chunks
- 删除：默认只删索引；`?purgeFiles=1` 连源文件一起删

### 2.4 存储与备份

- 存储位置是用户设置（`settings` 表），必须绝对路径；保存时建目录 + 写探针验证可写
- 未设置时：上传按钮禁用 + 服务端 400；纯文本粘贴仍可入库
- 目录：`<设置目录>/files/<文档id>/<原文件名>`、`<设置目录>/markdown/<文档id>.md`
- 改存储位置可选迁移（搬文件 + 回写库 + 清理空目录 + 报告缺失）
- 备份：单一 zip（`manifest.json` + 源文件），恢复时重新解析、按哈希去重
- 不含会话/日志/设置（按决策：会话需要时重新问）

### 2.5 MCP / 插件

- 传输：Streamable HTTP + stdio（`shell:false`、`windowsHide`、SIGTERM→SIGKILL、env 白名单）
- 超时：连接 15s、请求 15s；工具结果单条上限 20,000 字符
- 内置 3 个（Context7 / DeepWiki / MDN），自定义 MCP 存 `custom_mcp` 表
- 每个插件可声明 `modelHint` 和 `toolAllowlist`
- **启动状态**：`init()` 串行连接（实测约 20 秒），期间 `PluginView.connecting = true`，前端每 2 秒轮询到状态稳定；连上后显示「已连接 · N 个工具」

### 2.6 内置面板

| 面板 | 能力 |
|---|---|
| 数据库浏览 | 只读：表列表、表结构、分页查询 |
| 日志 | 统计、筛选、清空 |
| 文档库 | 上传、列表、重命名、删除、检索、重建索引、存储设置（含迁移） |
| MCP 管理 | 内置/自定义列表、启用停用、测试连接、粘贴 JSON 配置、删除 |
| 插件面板 | 内置功能开关、MCP 开关、自定义 MCP |

### 2.7 上下文管理

- 估算：中文 1 字 1 token，其他 4 字符 1 token
- 预算：历史 `12,000` token；模型窗口 `CORPUS_CONTEXT_TOKENS` 默认 128k
- 按轮截断；`notice` 帧提醒（截断 / ≥60% / ≥90%）
- 交接摘要：`POST /api/conversation/:id/handoff`，模板 `prompts/handoff.md`

### 2.8 模型配置（0.1.0 新增）

- 配置存 `settings` 表：`llm.baseUrl` / `llm.model` / `llm.apiKey`
- **优先级**：界面配置 > `.env`（`.env` 只在非 production 读取）
- 保存后立即生效（重新 `initLLMConfig`），不用重启
- `GET /api/settings/llm` 只回 `configured/source/baseUrl/model/hasApiKey`，**永不回显 key**
- 未配置时：`POST /api/chat/send` 在写库前返回 400；前端禁用输入框 + 顶部横幅 + 徽章点击进设置

### 2.9 发布形态（0.1.0 新增）

- server 同时托管前端：`CORPUS_WEB_DIR` 指向 `web/`，非 `/api` 的 GET 回落 `index.html`
- 资源路径：`CORPUS_RESOURCES_DIR` 指向包内 `resources/`（prompts + plugins）
- 端口：**固定 8787**，不自动回退；实际端口写入 `CORPUS_PORT_FILE`，launcher 据此开浏览器
- 启动清理：launcher 扫描 8787–8807，结束占用端口的旧 Corpus 实例（只杀 Corpus / node 进程；其他程序占用时只报错不动手）
- 关窗口即退出：不再“认领”旧实例，窗口里的进程就是唯一的服务进程；`SIGINT/SIGTERM/SIGBREAK` 会显式收尾
- 启动写探针：数据库不可写时给中文原因并退出，不半启动
- 打包：`scripts/build-package.mjs`（vite build + rolldown 打单文件 server + 复制 node.exe + 资源）

---

## 3. 数据与接口清单

### 3.1 数据库表

`schema_migrations`、`conversations`、`messages`、`plugin_settings`、`logs`、`custom_mcp`、`documents`、`chunks`、`chunks_fts`、`settings`

迁移 `001`~`011`（`packages/server/src/db/migrations/`），全部用 `PRAGMA table_info` 守卫，可重复执行；启动时若有未应用迁移会先 `backup` 出 `.backup` 文件。

### 3.2 HTTP API（全部挂 `/api`）

| 路径 | 方法 | 用途 |
|---|---|---|
| `/chat/send` | POST | 流式对话 |
| `/chat/stop/:conversationId` | POST | 停止生成 |
| `/conversation` | GET | 会话列表 |
| `/conversation/search?q=` | GET | 会话搜索 |
| `/conversation/:id` | GET / PATCH / DELETE | 历史 / 重命名 / 删除 |
| `/conversation/:id/handoff` | POST | 交接摘要 |
| `/documents` | GET / POST | 列表 / 粘贴入库 |
| `/documents/upload?filename=` | POST | 二进制上传 |
| `/documents/:id/content?start=&end=` | GET | 打开原文片段 |
| `/documents/:id` | PATCH / DELETE | 重命名 / 删除（`purgeFiles`） |
| `/documents/search?q=` | GET | 文档检索 |
| `/documents/reindex` | POST | 重建索引 |
| `/settings/documents` | GET / PUT | 存储设置（含 `migrate`） |
| `/settings/llm` | GET / PUT | **模型配置（0.1.0 新增）** |
| `/backup` | GET / POST | 导出 / 导入备份 |
| `/logs`、`/logs/stats`、`/logs/conversations` | GET/DELETE | 日志 |
| `/plugins`、`/plugins/states`、`/plugins/test`、`/plugins/custom`、`/plugins/:id/enabled` | 混合 | 插件管理 |
| `/db/tables`、`/db/query` | GET/POST | 数据库浏览（只读） |
| `/tools`、`/tools/:name` | GET/POST | 工具调试 |
| `/healthz`、`/chat-readyz` | GET | 健康检查 |

未匹配的 `/api/*` 返回 JSON 404；未处理异常由统一错误中间件返回 JSON（不再吐 HTML 堆栈）。

### 3.3 环境变量

```
LLM_BASE_URL / LLM_MODEL / LLM_API_KEY   # 开发环境用；界面配置优先
CORPUS_DB              # 数据库路径（默认 %APPDATA%\Corpus\corpus.db）
CORPUS_CONTEXT_TOKENS  # 模型上下文窗口，默认 128000
CORPUS_WEB_DIR         # 前端产物目录（打包时由 launcher 设置）
CORPUS_RESOURCES_DIR   # prompts/ 与 plugins/ 的根目录（打包时由 launcher 设置）
CORPUS_PORT_FILE       # 实际端口写入位置（launcher 读取）
```

---

## 4. 测试与质量

```
19 个测试文件 / 76 个用例，全部通过（本次交接前实跑 19/19）
tsc（server + web）0 错误，oxlint 0 warning（146 个文件）
```

覆盖重点：解析/分块、真实 PDF、存储/去重/重建、检索打分、上下文/交接、备份、迁移/存储设置。

**明确不做**：API 层测试、前端测试、覆盖率（用户决策）。

本地跑测试（沙箱里 `pnpm test` 会因 spawn 受限失败，用直连方式）：

```powershell
# 单个文件
node --import ./.tmp/ts-register.mjs packages/server/src/retrieval/flow.test.ts
# 全部
Get-ChildItem packages -Recurse -Filter *.test.ts | ForEach-Object { node --import ./.tmp/ts-register.mjs $_.FullName }
```

> 注意：`vite build` 与 `esbuild` 都需要 spawn 子进程，在受限沙箱里会报 `EPERM`。前端构建必须在普通终端跑。

---

## 5. 未完成 / 延后（及原因）

| 项 | 状态 | 原因 / 触发条件 |
|---|---|---|
| 评测集（M7） | 未做 | **2026-11-18 明确推迟到二期**；一期靠人工验证 |
| 语义检索（embedding） | 延后 | 需接 embedding 服务；`getEmbedder()` 已留口 |
| 联网检索（M8） | 未开始 | 与"工具结果进引用"共用 Citation 生产逻辑 |
| 工具结果进引用 | 未做 | MCP 结果只进上下文，`provenance: 'web'` 未使用 |
| Electron 安装包 | 未做 | 原计划 Tauri，2026-11 改 Electron；**先验证 `node:sqlite`** |
| 对话即摄取（M10） | 未开始 | 优先级低于 M8 |
| 插件渲染协议（architecture §8） | 未实现 | 现有面板都是自绘 UI |
| Host 契约 / apiVersion | 未定义 | 插件走 MCP，核心契约暂时不需要 |

---

## 6. 已知问题与技术债

| # | 问题 | 影响 | 建议 |
|---|---|---|---|
| 1 | 拒答阈值 `0.25` 未标定 | 可能误拒或误收 | 有评测集后标定 |
| 2 | token 估算是近似值 | 极端长文本可能估偏 | 需要时接 tokenizer |
| 3 | 中文检索无同义词、会话搜索是 LIKE | 召回不全 | 接 embedding 时统一处理 |
| 4 | 备份不含设置/会话 | 换机需重设存储路径 | 文档写明；需要时再加可选导出 |
| 5 | 工具结果不进引用 | "每个答案挂出处"在工具场景不成立 | 与 M8 一起补 |
| 6 | 无鉴权、无多用户 | 仅本机可用（只绑 127.0.0.1） | v1 决策，不提前抽象 |
| 7 | 多实例共用数据库 | 后开的实例写不进去（readonly） | 已加 launcher 单实例认领 + 启动写探针；开发模式仍可能撞 |
| 8 | 开发模式 Vite proxy 固定 8787 | 已随“固定端口”方案消解：后端不再换端口 | 无需处理 |
| 9 | `vite.config.ts` / `tsconfig.json` 是 GBK 编码 | 里面中文注释在 UTF-8 编辑器里乱码 | 改这两个文件时注意不要按 UTF-8 保存 |
| 10 | 上传解压无输出上限 | 恶意 docx 可能撑爆内存 | 加 `maxOutputLength`（未做） |

---

## 7. 下一步开发计划

排序原则：先补"承诺"，再补"标尺"，最后扩来源。

### P0 · 0.1.0 发布收尾（进行中）

- ✅ 2026-11-18：第一阶段代码已提交（文档库、按需检索、模型配置、引用面板、Electron 外壳）
- ⏳ 在正常终端（非沙箱）跑一次 `pnpm build`，确认 electron-builder 产出安装包
- ⏳ 首屏按钮（附件、知识库）未接入的占位入口，隐藏或标注「未接入」
- ⏳ `git tag v0.1.0`

### P0 · 评测集（2 人日）

- `evals/cases.json` 30 条 + `evals/run.ts`
- 指标：召回命中率 / 引用正确率 / 拒答正确率
- 验收：一条命令 30 秒出三个数，改动前后可对比

### P1 · 工具结果进引用 + 联网检索（3~4 人日）

- MCP 工具返回内容转成 `Citation`（`provenance: 'web'`，带 URL）
- 新增 web search 工具（搜索 API，不自建抓取）
- 前端引用栏区分来源，联网引用可点开链接
- 验收：用工具回答时能显示网页出处；断网时本地检索不受影响

### P2 · 语义检索（3~4 人日）

- 实现 `getEmbedder()` 返回真实 embedder（key 不进日志）
- 入库写向量；检索走混合打分；阈值重新标定
- 复用 `POST /documents/reindex` 重建老数据

### P3 · Electron 安装包（5~7 人日）

- **第一步先验证 `node:sqlite` 在 Electron 的 Node 下可用**；不可用则评估换驱动（better-sqlite3 + rebuild）
- 主进程内嵌 server 或 child 启动，窗口 `loadURL` 同源地址
- 单实例、退出清理、安装器/图标/卸载
- 资源路径改用 `process.resourcesPath`

### P4 · 对话即摄取（M10，2 人日）

- "存为知识"按钮 → 会话片段入库，`provenance: 'model'` 不参与证据

### P5 · 打磨（持续）

- 列表三态（加载/空/错误）统一；失败不再显示成"空"
- 窄屏抽屉宽度下限、触摸目标 ≥40×40、辅助文字 ≥12px
- 前端与 API 测试（按需）

---

## 8. 关键决策记录（为什么是这样）

1. **数据目录**：DB 默认 `%APPDATA%\Corpus`；文档文件位置由用户设置——避免安装目录写权限与升级丢数据。
2. **引用持久化**：`citations` 以 JSON 存 `messages` 一列，不拆表。
3. **拒答两层**：无候选 → 短路；有候选但分低 → 同样短路。
4. **PDF 先结构化再切块**：PDF 没有段落信息，不预处理的话 locator 等于没有。
5. **备份只存源文件**：索引可由源文件重建；会话不备份。
6. **MCP 而不是自研插件协议**：协议已有。
7. **模型配置存库、界面优先**：生产环境没有 `.env`，用户必须能自己配；key 不回显。
8. **桌面壳改 Electron**：2026-11 决策；`node:sqlite` 可用性是前置风险。
9. **便携版内置 node.exe**：用户不装 Node，代价是包约 90MB。
10. **端口自动回退**：用户不知道谁占着端口；起不来比换端口伤害大。

---

## 9. 新会话上手步骤

1. 读 `AGENTS.md`（硬规则：非平凡改动先提案；每步 30 分钟能跑）
2. 读本文件，再按需查 `docs/architecture.md`
3. 确认环境：`.env` 有 `LLM_*`（或界面里配）；`node -v`（≥22.5，当前 v24.22）；依赖已 `pnpm install`
4. 起服务：`pnpm dev` + `pnpm --filter @corpus/web dev`（用户手动跑；沙箱不能 spawn）
5. 改完必查：

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc -p packages/web/tsconfig.app.json
node node_modules/oxlint/bin/oxlint
# 以及受影响的 *.test.ts（见第 4 节）
```

6. 开发前先看 §7 的优先级，不要顺手扩范围
7. 新踩的坑记到 `docs/journal/`，只记"下次还会踩"的具体问题
