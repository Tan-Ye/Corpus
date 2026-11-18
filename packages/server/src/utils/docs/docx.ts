import { readZipEntries } from './zip';

const PARAGRAPH = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
const PARAGRAPH_STYLE = /<w:pStyle\b[^>]*w:val="([^"]+)"/;
const TEXT_RUN = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
const BREAK = /<w:(?:br|cr)\b[^>]*\/?>/g;

function decodeXml(text: string): string {
    return text
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'")
        .replaceAll('&#39;', "'")
        .replaceAll('&amp;', '&');
}

/** Word 的内置样式名 → Markdown 标题级别 */
function styleToLevel(style: string): number {
    if (/^Heading\s*(\d)$/i.test(style)) {
        return Number(style.replace(/\D/g, '')) || 1;
    }

    if (/^Title$/i.test(style)) {
        return 1;
    }

    return 0;
}

function paragraphToMarkdown(block: string): string {
    const style = PARAGRAPH_STYLE.exec(block)?.[1] ?? '';
    const text = [...block.matchAll(TEXT_RUN)]
        .map((match) => decodeXml(match[1] ?? ''))
        .join('')
        // 段内换行：<w:br/> 在 markdown 里就是换行
        .replace(BREAK, '\n')
        .trim();

    if (!text) {
        return '';
    }

    const level = styleToLevel(style);

    return level > 0 ? `${'#'.repeat(Math.min(level, 6))} ${text}` : text;
}

/**
 * docx → Markdown。
 *
 * 只取正文段落和标题：标题靠 w:pStyle 的 Heading1..6 判断，
 * 这样解析出来的 markdown 能被 rag/parse 正确切节。
 * 表格、图片、批注暂不处理（后续按需补）。
 */
export function docxToMarkdown(buffer: Buffer): string {
    const entries = readZipEntries(buffer);
    const documentXml = entries.get('word/document.xml');

    if (!documentXml) {
        throw new Error('docx 里找不到 word/document.xml');
    }

    const blocks = [...documentXml.toString('utf8').matchAll(PARAGRAPH)]
        .map((match) => paragraphToMarkdown(match[1] ?? ''))
        .filter(Boolean);

    return `${blocks.join('\n\n')}\n`;
}
