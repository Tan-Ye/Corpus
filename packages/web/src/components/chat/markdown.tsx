import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

import { cn } from '@/utils';

interface MarkdownProps {
    content: string;
    className?: string;
}

/**
 * 正文渲染。
 *
 * 样式走显式组件映射，不用 @tailwindcss/typography：
 * 那套自带颜色和字号，会和我们的令牌体系（全站一个强调色、四档字号）打架。
 *
 * react-markdown 默认不渲染原始 HTML，所以没有 XSS 风险，不需要额外净化。
 */
export function Markdown({ content, className }: MarkdownProps) {
    return (
        <div className={cn('flex flex-col gap-3 text-base leading-7', className)}>
            <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                rehypePlugins={REHYPE_PLUGINS}
                components={COMPONENTS}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}

/**
 * 行内代码和块级代码共用这一个组件。
 * 块级的高亮 class（hljs language-xxx）由 rehype-highlight 加，行内的没有。
 */
function Code({ className, children }: { className?: string; children?: ReactNode }) {
    const isBlock = typeof className === 'string' && className.includes('language-');

    if (isBlock) {
        return <code className={cn('font-mono text-sm', className)}>{children}</code>;
    }

    return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{children}</code>;
}

/*
 * 三个常量都放在模块顶层，不要写进组件体内：
 * - 每次渲染重建对象会让 ReactMarkdown 重新初始化插件和高亮
 * - 渲染期定义组件也会被 lint 判成 nested component
 */
const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

const COMPONENTS: Components = {
    p: ({ children }) => <p className="leading-7">{children}</p>,
    h1: ({ children }) => (
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{children}</h1>
    ),
    h2: ({ children }) => (
        <h2 className="mt-2 text-lg font-semibold tracking-tight">{children}</h2>
    ),
    h3: ({ children }) => <h3 className="mt-2 text-base font-semibold">{children}</h3>,
    ul: ({ children }) => <ul className="flex list-disc flex-col gap-1 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="flex list-decimal flex-col gap-1 pl-5">{children}</ol>,
    li: ({ children }) => <li className="leading-7">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    a: ({ children, href }) => (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-brand"
        >
            {children}
        </a>
    ),
    blockquote: ({ children }) => (
        <blockquote className="border-l-2 pl-3 text-muted-foreground">{children}</blockquote>
    ),
    pre: ({ children }) => (
        <pre className="overflow-x-auto rounded-xl border bg-muted/40 p-3">{children}</pre>
    ),
    code: Code,
    table: ({ children }) => (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">{children}</table>
        </div>
    ),
    th: ({ children }) => <th className="border-b px-2 py-1.5 text-left font-medium">{children}</th>,
    td: ({ children }) => <td className="border-b px-2 py-1.5">{children}</td>,
    hr: () => <hr className="border-border" />,
};
