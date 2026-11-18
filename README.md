# Corpus

> 你的资料，一个有据可查的整体。

个人（可扩展到小团队）的知识库问答应用：把散落的文档变成一个能对话、每句话都有出处的资料体。

**当前版本 0.1.0**：文档解析 + 文档查询。变更见 [CHANGELOG.md](CHANGELOG.md)。
语义检索、联网检索、评测集、安装包仍在计划中，见 [docs/HANDOFF.md](docs/HANDOFF.md) §7。

---

## 它是什么

不是"加了上传按钮的 ChatGPT"，而是一个读过你全部资料、随时待命、但必须交出证据的助手。

| | 含义 | 当前状态 |
|---|---|---|
| **引用** | 每个答案挂原文出处，可点开、可跳回原文 | ✅ 已实现（本地文档） |
| **拒答** | 资料里没有就明说，不用通用知识糊 | ✅ 已实现（检索层短路） |
| **评测** | 30 条问答对做回归标尺 | ⬜ 未做，调参暂时靠人工验证 |

---

## 它做什么（0.1.0 已实现）

| 功能 | 说明 |
|---|---|
| 对话 | 流式、多轮、可中断；多会话、搜索、重命名、删除 |
| 资料入库 | Markdown / 文本 / Word(.docx) / PDF；PDF 做编章节条识别与行号定位 |
| 检索 | 关键词（FTS5 + 中文二元组），覆盖率闸门 + BM25 相对分 |
| 引用溯源 | 正文 `[n]` 可点开原文并高亮命中行 |
| 拒答 | 检索不到或分数低于阈值时直接明说 |
| 模型配置 | 界面内填写服务地址 / 模型名 / API Key；未配置时不允许发送 |
| 插件扩展 | MCP 接入（内置 Context7、DeepWiki、MDN，可加自定义） |
| 备份 | 导出/导入 zip（文档源文件，不含会话与设置） |

**还没做**：语义（向量）检索、联网检索、工具结果进引用、对话即摄取、评测集、安装包。

---

## 它不是什么

- **不是多租户 SaaS**。v1 不做权限体系，只绑 `127.0.0.1`，本机使用。
- **不是插件市场**。插件只服务自己用，不做生态、不做沙箱。
- **不是通用 agent 平台**。只做"在资料库中找答案"这一件事。

---

## 用起来（便携版）

1. 解压 `Corpus-0.1.0-win64.zip`，双击 `start.bat`（内置 Node 运行时，不用另装）
2. 浏览器会自动打开 `http://127.0.0.1:8787/`；启动时会自动清理占用这个端口的旧 Corpus 实例（只清 Corpus 自己，别的程序占用会明确报错）
3. **先配模型**：点右上角显示「未配置模型」的徽章，填服务地址、模型名、API Key
4. 侧栏「文档」→ 设置文件存储位置（必填，否则不能上传）
5. 上传文档，然后提问

命令行窗口不要关——关掉它就等于关掉服务。数据在 `%APPDATA%\Corpus\`，整个目录拷走即可换机器。

---

## 从源码跑

需要 **Node ≥ 22.5**（用到内置 `node:sqlite`，当前开发机 v24.22）和 pnpm。

```powershell
pnpm install
pnpm dev                                # 后端 :8787
pnpm --filter @corpus/web dev           # 前端 :5173（另开一个终端）
```

首次使用前复制 `.env.example` 为 `.env` 并填 `LLM_*`；也可以在界面里配模型（界面配置优先于 `.env`，且 `.env` 只在非 production 读取）。

常用检查：

```powershell
node node_modules/typescript/bin/tsc --noEmit                  # 类型
node node_modules/typescript/bin/tsc -p packages/web/tsconfig.app.json
node node_modules/oxlint/bin/oxlint                            # lint
node --import ./.tmp/ts-register.mjs packages/server/src/retrieval/flow.test.ts   # 单个测试
```

打包便携版：

```powershell
node scripts/build-package.mjs     # 产物在 dist-package/Corpus-<version>-win64/
```

---

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 语言 | TypeScript | 全栈一套工具链 |
| 前端 | React 19 + Vite + Tailwind 4 | 单页应用，由后端同源托管 |
| 服务端 | Node.js + Express 5 | 独立包，可 headless 运行 |
| 存储 | SQLite（`node:sqlite`）+ FTS5 | 单文件、零安装；**不是** better-sqlite3 |
| LLM | OpenAI 兼容 API | 用户自带 key |
| 扩展 | MCP（只依赖 tools） | 不自己发明插件协议 |
| 桌面壳 | Electron（计划中） | 2026-11 由 Tauri 改为 Electron，尚未实现 |

---

## 目录结构

```
Corpus/
├─ packages/
│  ├─ core/       # 类型、LLM 调用、解析与分块
│  ├─ server/     # HTTP API、SQLite、检索、MCP、迁移
│  ├─ web/        # 前端
│  └─ shell/      # 桌面壳（空，Electron 方案待做）
├─ plugins/       # 内置 MCP 插件清单
├─ prompts/       # 系统提示词与交接摘要模板
├─ scripts/       # 便携版打包与启动器
├─ evals/         # 评测集（空，待做）
└─ docs/          # 架构、路线图、交接
```

---

## 从哪开始读

| 文档 | 内容 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | 架构、契约、数据模型、风险登记 |
| [docs/roadmap.md](docs/roadmap.md) | 里程碑、验收标准 |
| [docs/HANDOFF.md](docs/HANDOFF.md) | 最近一次交接：现状、缺口、下一步 |
| [AGENTS.md](AGENTS.md) | 给协作者（含 AI）的约定 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更与下一版计划 |
