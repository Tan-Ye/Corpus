import type { Section, SourceDoc } from '../types/docs';

const HEADING = /^(#{1,6})\s+(.+?)\s*$/;

/**
 * Markdown → 按标题切分的 section。
 *
 * 只负责「切开并记住位置」：标题路径 + 正文 + 起止行号。
 * 长度控制、重叠这些放在 chunk.ts，解析和分块可以各自替换。
 *
 * 两个容易踩的点都在这里处理：
 * - 代码块里的 # 不是标题
 * - 第一个标题之前的内容（前言）也要算一节，否则纯文本文档会整篇丢失
 */
export function parseMarkdown(document: SourceDoc): Section[] {
    const lines = document.text.split(/\r?\n/);
    const sections: Section[] = [];

    /** 当前标题路径，例如 ['分块策略', '按标题切分']；前言部分是空数组 */
    let headingPath: string[] = [];
    let bodyLines: string[] = [];
    let sectionStart = 1;
    /** 代码块里的 # 不是标题，必须整段跳过 */
    let inFence = false;

    function flush(endLine: number) {
        const text = bodyLines.join('\n').trim();

        if (text) {
            sections.push({
                headingPath: [...headingPath],
                text,
                startLine: sectionStart,
                endLine,
            });
        }

        bodyLines = [];
    }

    for (const [index, line] of lines.entries()) {
        const lineNumber = index + 1;

        if (line.trimStart().startsWith('```')) {
            inFence = !inFence;
            bodyLines.push(line);
            continue;
        }

        if (inFence) {
            bodyLines.push(line);
            continue;
        }

        const heading = HEADING.exec(line);

        if (!heading) {
            bodyLines.push(line);
            continue;
        }

        // 遇到新标题，先把上一段收尾（结束行是标题的上一行）
        flush(lineNumber - 1);

        const level = heading[1]?.length ?? 1;
        const title = heading[2] ?? '';

        // 同级或更高级的标题会截断路径，形成新的分支
        headingPath = [...headingPath.slice(0, level - 1), title];
        sectionStart = lineNumber;
    }

    flush(lines.length);

    return sections;
}
