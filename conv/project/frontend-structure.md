# 项目特有规则 · frontend-structure

通用规则见 [../rules/frontend-structure.md](../rules/frontend-structure.md)。

本文件只写**本项目独有**的补充规则，不重复通用规则。
由 `conv` 于 2026-11-10 初始化，后续由项目维护者自行编辑。

## 目录约定

```
packages/web/src/
├─ pages/<模块>/index.tsx     # 页面
├─ components/ui/             # shadcn 生成，不手改
├─ components/<模块>/         # 业务组件
├─ types/                     # 跨 2 个以上模块共用的类型
├─ hooks/                     # use-* 自定义 hook + index.ts 桶文件
├─ utils/                     # 纯函数 + cn 转出 + index.ts 桶文件
└─ index.css                  # 唯一全局样式
```

## 本项目补充

1. 页面固定放 `src/pages/<模块>/index.tsx`；页面私有的组件、演示数据放同目录，不进 `components/`。
2. `components/ui/` 是 shadcn 生成物，**不改**。要调整表现就在 `components/<模块>/` 里包一层，或在使用处传 `className`。
3. 路径别名 `@/*` → `src/*`，与 `vite.config.ts` 的 `resolve.alias`、`tsconfig.json` / `tsconfig.app.json` 的 `paths`、`components.json` 的 `aliases` 四处必须一致。
4. **没有 `src/lib/`**。`cn` 由 shadcn v4 的 `cn` 包提供，统一从 `@/utils` 转出；`utils/` 是唯一的工具目录。
5. 会话与消息的类型集中在 `src/types/chat.ts`；后端契约变化时只改这一个文件。
6. 组件文件用 kebab-case，组件名用 PascalCase，全部具名导出（页面同理，不用 default）。
7. 演示数据放 `pages/<模块>/demo-data.ts`，接上真实接口后整个文件删除，不要留在业务代码里。
8. 新增 shadcn 组件只走 CLI（`pnpm exec shadcn add <组件>`），不手写 `components/ui/` 下的文件。
9. 移动端与桌面端共用同一套组件，用断点控制显隐；不为移动端另写一套组件。
