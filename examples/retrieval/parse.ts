import type { Section, SourceDoc } from './types';

const HEADING = /^(#{1,6})\s+(.+?)\s*$/;

/**
 * Markdown → 按标题切分的 section。
 *
 * 只做一件事：把「标题路径 + 正文 + 行号」抽出来。
 * 真正的分块（限长、重叠）在 chunk.ts，解析和分块分开写，方便单独替换。
 */
export function parseMarkdown(doc: SourceDoc): Section[] {
    const lines = doc.text.split(/\r?\n/);
    const sections: Section[] = [];

    /** 当前的标题路径，例如 ['分块策略', '按标题切分'] */
    let headingPath: string[] = [];
    let bodyLines: string[] = [];
    let sectionStart = 1;
    let inSection = false;

    function flush(endLine: number) {
        const text = bodyLines.join('\n').trim();

        if (inSection && text) {
            sections.push({
                headingPath: [...headingPath],
                text,
                startLine: sectionStart,
                endLine,
            });
        }

        bodyLines = [];
    }

    lines.forEach((line, index) => {
        const lineNumber = index + 1;
        const heading = HEADING.exec(line);

        if (!heading) {
            bodyLines.push(line);
            return;
        }

        // 遇到新标题：先结束上一段
        flush(lineNumber - 1);

        const level = heading[1]?.length ?? 1;
        const title = heading[2] ?? '';

        // 同级或更高级的标题会截断路径
        headingPath = [...headingPath.slice(0, level - 1), title];
        sectionStart = lineNumber;
        inSection = true;
    });

    flush(lines.length);

    return sections;
}
