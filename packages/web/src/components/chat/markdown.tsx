import type { MouseEvent, ReactNode } from 'react';
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

/** hast 里我们真正用到的最小结构 */
interface HastNode {
    type: string;
    value?: string;
    tagName?: string;
    /** 规范要求 element 必须有 properties（可以是空对象），react-markdown 会对它用 Object.hasOwn */
    properties?: Record<string, unknown>;
    children?: HastNode[];
}

const CITATION_PATTERN = /\[\d+\]/;
const CITATION_EXACT = /^\[(\d+)\]$/;

/**
 * 把正文里的 [n] 变成上标。
 *
 * 在 rehype 阶段做（而不是改 markdown 文本），这样代码块里的 [1] 不会被误伤。
 */
function rehypeCitationMarkers() {
    return (tree: unknown) => {
        walk(tree as HastNode);
    };
}

function walk(node: HastNode): void {
    const children = node.children;

    if (!children) {
        return;
    }

    // 倒序遍历：splice 后不会影响还没处理的节点下标
    for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];

        if (!child) {
            continue;
        }

        if (child.type === 'text' && child.value && CITATION_PATTERN.test(child.value)) {
            children.splice(index, 1, ...splitCitationText(child.value));
            continue;
        }

        // 代码里的 [1] 是代码，不是引用
        if (child.type === 'element' && (child.tagName === 'code' || child.tagName === 'pre')) {
            continue;
        }

        walk(child);
    }
}

function splitCitationText(value: string): HastNode[] {
    return value
        .split(/(\[\d+\])/g)
        .filter(Boolean)
        .map((part) => {
            const match = CITATION_EXACT.exec(part);

            if (!match) {
                return { type: 'text', value: part };
            }

            return {
                type: 'element',
                tagName: 'sup',
                // 少了它 react-markdown 会执行 Object.hasOwn(undefined, key) 直接抛错
                properties: {},
                children: [{ type: 'text', value: match[1] ?? '' }],
            };
        });
}

/** [n] 上标：点击滚动到本条回答下面的出处条目 */
function CitationMark({ children }: { children?: ReactNode }) {
    const number = String(children ?? '').trim();

    function handleClick(event: MouseEvent<HTMLButtonElement>) {
        const root = event.currentTarget.closest('[data-message-id]');
        const target = root?.querySelector(`[data-citation-ref="${number}"]`);

        target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    return (
        <sup>
            <button
                type="button"
                onClick={handleClick}
                aria-label={`查看第 ${number} 条出处`}
                className="mx-0.5 rounded px-0.5 font-mono text-[0.7em] text-brand hover:underline"
            >
                [{number}]
            </button>
        </sup>
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
const REHYPE_PLUGINS = [rehypeHighlight, rehypeCitationMarkers];

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
    sup: CitationMark,
    table: ({ children }) => (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">{children}</table>
        </div>
    ),
    th: ({ children }) => <th className="border-b px-2 py-1.5 text-left font-medium">{children}</th>,
    td: ({ children }) => <td className="border-b px-2 py-1.5">{children}</td>,
    hr: () => <hr className="border-border" />,
};
