import type { Chunk, Section, SourceDoc } from './types';

/** 单块上限（字符）。中文技术文档 400~600 字比较合适 */
const MAX_CHARS = 480;

/** 相邻块的重叠长度，避免答案被切在边界上 */
const OVERLAP_CHARS = 80;

interface Paragraph {
    text: string;
    startLine: number;
    endLine: number;
}

/** 按空行切段落，同时记下每段的起止行号 */
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

/** 单段超长时硬切：这里刻意不做句子切分，保持示例可读 */
function hardSplit(paragraph: Paragraph): Paragraph[] {
    if (paragraph.text.length <= MAX_CHARS * 2) {
        return [paragraph];
    }

    const pieces: Paragraph[] = [];

    for (let offset = 0; offset < paragraph.text.length; offset += MAX_CHARS) {
        pieces.push({
            text: paragraph.text.slice(offset, offset + MAX_CHARS),
            startLine: paragraph.startLine,
            endLine: paragraph.endLine,
        });
    }

    return pieces;
}

/**
 * section → chunks。
 *
 * 规则：段落是原子单位，攒到接近 MAX_CHARS 就切一块；
 * 块与块之间保留 OVERLAP_CHARS 的尾巴，行号仍然指向正文真实位置。
 */
function chunkSection(doc: SourceDoc, section: Section): Omit<Chunk, 'id'>[] {
    const paragraphs = splitParagraphs(section.text, section.startLine + 1).flatMap(hardSplit);
    const pieces: Omit<Chunk, 'id'>[] = [];

    let buffer: Paragraph[] = [];
    let carry = '';

    function emit() {
        const [first] = buffer;
        const last = buffer.at(-1);

        if (!first || !last) {
            return;
        }

        const body = buffer.map((paragraph) => paragraph.text).join('\n\n');

        pieces.push({
            docId: doc.id,
            docTitle: doc.title,
            headingPath: [...section.headingPath],
            startLine: first.startLine,
            endLine: last.endLine,
            text: carry ? `${carry}\n\n${body}` : body,
        });

        carry = body.slice(-OVERLAP_CHARS).trim();
        buffer = [];
    }

    for (const paragraph of paragraphs) {
        const currentLength = buffer.reduce((sum, item) => sum + item.text.length, 0);

        if (buffer.length > 0 && currentLength + paragraph.text.length > MAX_CHARS) {
            emit();
        }

        buffer.push(paragraph);
    }

    emit();

    return pieces;
}

export function chunkDocument(doc: SourceDoc, sections: Section[]): Chunk[] {
    // id 在整篇文档范围内编号，不能在每个 section 里从 0 开始，否则会撞主键
    return sections
        .flatMap((section) => chunkSection(doc, section))
        .map((chunk, index) => ({ ...chunk, id: `${doc.id}#${index}` }));
}
