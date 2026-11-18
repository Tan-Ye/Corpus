import type { Section, SourceDoc, TextChunk } from '../types/docs';

/** 单块目标长度（字符）。中文技术文档 400~600 比较合适 */
export const MAX_CHUNK_CHARS = 480;

/** 相邻块重叠长度，避免答案正好被切在边界 */
export const CHUNK_OVERLAP_CHARS = 80;

interface Paragraph {
    text: string;
    startLine: number;
    endLine: number;
}

/** 按空行切段落，并记录每段的起止行号 */
function splitParagraphs(text: string, baseLine: number): Paragraph[] {
    const lines = text.split('\n');
    const paragraphs: Paragraph[] = [];
    let buffer: string[] = [];
    let startLine = baseLine;

    for (const [index, line] of lines.entries()) {
        const lineNumber = baseLine + index;

        if (line.trim() === '') {
            if (buffer.length > 0) {
                paragraphs.push({
                    text: buffer.join('\n'),
                    startLine,
                    endLine: lineNumber - 1,
                });
                buffer = [];
            }
            continue;
        }

        if (buffer.length === 0) {
            startLine = lineNumber;
        }
        buffer.push(line);
    }

    if (buffer.length > 0) {
        paragraphs.push({
            text: buffer.join('\n'),
            startLine,
            endLine: baseLine + lines.length - 1,
        });
    }

    return paragraphs;
}

/** 句子/段落边界的标点：硬切时优先在这些位置断开 */
const BREAK_CHARS = new Set(['。', '！', '？', '；', '!', '?', ';', '\n']);

/**
 * 在 [start, limit) 里找最后一个句子边界，找不到就切在 limit。
 * 最少保留 60% 的长度，避免为了一句结尾把块切得太碎。
 */
function findBreak(text: string, start: number, limit: number): number {
    const floor = start + Math.floor((limit - start) * 0.6);

    for (let index = limit - 1; index >= floor; index -= 1) {
        if (BREAK_CHARS.has(text[index] ?? '')) {
            return index + 1;
        }
    }

    return limit;
}

/** 单段超过上限就硬切：切出来的每一片要各自知道自己的行号，不能共用整段的范围 */
function hardSplit(paragraph: Paragraph): Paragraph[] {
    if (paragraph.text.length <= MAX_CHUNK_CHARS) {
        return [paragraph];
    }

    // 每一行在段落文本里的起始偏移，用来把字符偏移换算回行号
    const lineStarts: number[] = [];
    let offset = 0;

    for (const line of paragraph.text.split('\n')) {
        lineStarts.push(offset);
        offset += line.length + 1;
    }

    function lineAt(position: number): number {
        let index = 0;

        while (index + 1 < lineStarts.length && (lineStarts[index + 1] ?? 0) <= position) {
            index += 1;
        }

        return index;
    }

    const pieces: Paragraph[] = [];
    let start = 0;

    while (start < paragraph.text.length) {
        const limit = Math.min(start + MAX_CHUNK_CHARS, paragraph.text.length);
        // 切在句子边界上，引用时才不会出现「依据本法第五」这种半句话
        const end = limit === paragraph.text.length ? limit : findBreak(paragraph.text, start, limit);

        pieces.push({
            text: paragraph.text.slice(start, end),
            startLine: paragraph.startLine + lineAt(start),
            endLine: paragraph.startLine + lineAt(end),
        });

        start = end;
    }

    return pieces;
}

function chunkSection(document: SourceDoc, section: Section): Omit<TextChunk, 'id'>[] {
    const paragraphs = splitParagraphs(section.text, section.startLine + 1).flatMap(hardSplit);
    const pieces: Omit<TextChunk, 'id'>[] = [];

    let buffer: Paragraph[] = [];
    let carry = '';
    /** 当前块正文长度，包含段落之间的空行分隔符 */
    let bufferLength = 0;

    function emit() {
        const [first] = buffer;
        const last = buffer.at(-1);

        if (!first || !last) {
            return;
        }

        const body = buffer.map((paragraph) => paragraph.text).join('\n\n');

        pieces.push({
            documentId: document.id,
            documentTitle: document.title,
            headingPath: [...section.headingPath],
            startLine: first.startLine,
            endLine: last.endLine,
            text: carry ? `${carry}\n\n${body}` : body,
        });

        // 尾巴留到下一块开头；行号仍然指向正文真实位置
        carry = body.slice(-CHUNK_OVERLAP_CHARS).trim();
        buffer = [];
        bufferLength = 0;
    }

    for (const paragraph of paragraphs) {
        // 分隔符也算长度，否则正文会悄悄超过上限
        const extra = buffer.length > 0 ? paragraph.text.length + 2 : paragraph.text.length;

        if (buffer.length > 0 && bufferLength + extra > MAX_CHUNK_CHARS) {
            emit();
            bufferLength = paragraph.text.length;
        } else {
            bufferLength += extra;
        }

        buffer.push(paragraph);
    }

    emit();

    return pieces;
}

/**
 * 小于这个长度的块没有检索价值：
 * 典型来源是目录残留（比如整篇目录最后只剩一个「附则」），留在索引里只会干扰命中。
 * 阈值不能定太高——正常的小节正文也可能只有十几个字。
 * 如果整篇只剩这种碎块（极短文档），就不过滤，避免入库时被判成「没有正文」。
 */
const MIN_CHUNK_CHARS = 10;

/**
 * section → chunks。
 * id 在整篇文档内连续编号，不能按 section 各自从 0 开始（会撞主键）。
 */
export function chunkDocument(document: SourceDoc, sections: Section[]): TextChunk[] {
    const pieces = sections.flatMap((section) => chunkSection(document, section));
    const meaningful = pieces.filter((piece) => piece.text.trim().length >= MIN_CHUNK_CHARS);

    return (meaningful.length > 0 ? meaningful : pieces).map((piece, index) => ({
        ...piece,
        id: `${document.id}#${index}`,
    }));
}
