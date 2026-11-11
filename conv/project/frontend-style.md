# 项目特有规则 · frontend-style

通用规则见 [../rules/frontend-style.md](../rules/frontend-style.md)。

本文件只写**本项目独有**的补充规则，不重复通用规则。
由 `conv` 于 2026-11-10 初始化，后续由项目维护者自行编辑。

## 技术前提

- Tailwind CSS v4（`@import "tailwindcss"` + `@theme inline`），没有 `tailwind.config.js`。
- shadcn/ui，`style: new-york`，`baseColor: neutral`，CSS 变量模式。

## 本项目补充

1. 颜色只用语义令牌：`background` `foreground` `muted` `border` `accent` `brand`。组件里出现 hex 或 `bg-[#...]` 都算违规。
2. **全站只有一个强调色** `--brand`（紫 `#7C3AED`），只用在三处：品牌标记、发送按钮、引用图标的底色。其余一律中性灰。
3. 字体用系统栈（`system-ui` / `PingFang SC` / `Microsoft YaHei`），**不引 Google Fonts**——应用要离线可用，字体请求会阻塞首屏。
4. 深色模式通过 `@media (prefers-color-scheme: dark)` 覆盖令牌实现，不使用 `dark:` 前缀，也不提供手动切换（后续要手动切换再加 `.dark` 类，令牌只写一处）。
5. 圆角统一从 `--radius`（0.75rem）派生：卡片/输入框用 `rounded-2xl`，按钮/菜单项用 `rounded-lg`。
6. 页面根节点负责撑满：`h-full` + `flex`；内部滚动区必须是 `min-h-0 flex-1`，否则 `ScrollArea` 不滚。
7. 字号只到 `text-xs` / `text-sm` / `text-lg` / `text-xl` 这四档，正文用 `text-sm`，不新增档位。
8. 图标统一 `lucide-react`，尺寸用 `size-4`（16px）与 `size-6`（24px）两档，图标按钮的可点区域不小于 `size-8`。
