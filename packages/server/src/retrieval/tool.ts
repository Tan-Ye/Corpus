import type { DatabaseSync } from 'node:sqlite';

import type { RetrievedChunk } from '@corpus/core';
import type { Citation, ToolDefinition } from '@corpus/core/types';

import { getEmbedder } from './embedder';
import { searchChunks } from './search';
import { listDocuments } from './store';

/** 内置工具名：和 MCP 工具放在同一个 tools 数组里，模型按名字选 */
export const SEARCH_DOCUMENTS_TOOL = 'search_documents';

/** 一次最多回几段，再多上下文就全是原文了 */
const MAX_HITS = 4;

/** 指定文档时先多召回一些，过滤后再截断 */
const WIDE_LIMIT = 12;

function toCitations(hits: RetrievedChunk[]): Citation[] {
    return hits.map((hit) => {
        // headingPath 的第一段通常就是文章 H1，和 documentTitle 重复，去掉
        const path =
            hit.chunk.headingPath[0] === hit.chunk.documentTitle
                ? hit.chunk.headingPath.slice(1)
                : hit.chunk.headingPath;

        return {
            id: hit.chunk.id,
            documentId: hit.chunk.documentId,
            title:
                path.length > 0
                    ? `${hit.chunk.documentTitle} › ${path.join(' › ')}`
                    : hit.chunk.documentTitle,
            locator: `L${hit.chunk.startLine}-${hit.chunk.endLine}`,
            startLine: hit.chunk.startLine,
            endLine: hit.chunk.endLine,
            excerpt: hit.chunk.text.slice(0, 300),
            content: hit.chunk.text,
            provenance: 'doc',
        };
    });
}

/**
 * 检索工具的描述里要列「有哪些文档」，模型才知道该不该查。
 *
 * 描述空着就只给标题：至少还能靠标题判断，不至于把整库都当成一个黑盒。
 */
export function buildSearchDocumentsTool(db: DatabaseSync): ToolDefinition | null {
    const documents = listDocuments(db);

    if (documents.length === 0) {
        return null;
    }

    const lines = documents.map((document) => {
        const purpose = document.description?.trim();

        return purpose ? `- ${document.title}：${purpose}` : `- ${document.title}`;
    });

    return {
        name: SEARCH_DOCUMENTS_TOOL,
        description: [
            '在用户上传的文档库里检索原文片段。',
            '凡是问题涉及下列文档的内容，必须先调用本工具再回答，不要凭常识作答。',
            '',
            '可用文档：',
            ...lines,
        ].join('\n'),
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: '检索词：用问题里的 2~5 个关键词，不要整句复制',
                },
                document: {
                    type: 'string',
                    description: '可选：只查其中一篇，写上面的文档标题',
                },
            },
            required: ['query'],
        },
    };
}

export interface DocumentSearchOutcome {
    ok: boolean;
    text: string;
    citations: Citation[];
}

/**
 * 执行检索工具：返回给模型的文本带 [n] 编号，引用的顺序与 citations 一致，
 * 前端拿 citations 渲染出处，正文里的 [n] 才对得上。
 *
 * offset：本轮对话里已经收集到的引用条数。模型可能连续调多次工具，
 * 编号必须接着上一次的往下排，否则两次工具结果都从 [1] 开始，正文引用会错位。
 */
export async function runSearchDocuments(
    db: DatabaseSync,
    args: Record<string, unknown>,
    offset = 0,
): Promise<DocumentSearchOutcome> {
    const query = typeof args.query === 'string' ? args.query.trim() : '';

    if (!query) {
        return { ok: false, text: '检索词不能为空：query 必须是非空字符串', citations: [] };
    }

    const requestedTitle = typeof args.document === 'string' ? args.document.trim() : '';

    const result = await searchChunks(db, query, {
        embedder: getEmbedder(),
        limit: requestedTitle ? WIDE_LIMIT : MAX_HITS,
    });

    const hits = requestedTitle
        ? result.hits.filter((hit) => hit.chunk.documentTitle === requestedTitle)
        : result.hits;

    if (hits.length === 0) {
        const scope = requestedTitle ? `「${requestedTitle}」里` : '文档库里';

        return {
            ok: false,
            text:
                `${scope}没有找到与「${query}」相关的内容。` +
                '如果确认资料里没有，直接告诉用户没有找到，不要用常识补充。',
            citations: [],
        };
    }

    const citations = toCitations(hits.slice(0, MAX_HITS));
    const text = citations
        .map(
            (citation, index) =>
                `[${offset + index + 1}] ${citation.title}（${citation.locator}）\n${
                    citation.content ?? citation.excerpt ?? ''
                }`,
        )
        .join('\n\n');

    return { ok: true, text, citations };
}
