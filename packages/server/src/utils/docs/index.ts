import { extname } from 'node:path';

import { docxToMarkdown } from './docx';
import { normalizePlainText } from './normalize';
import { pdfToMarkdown } from './pdf';

export type DocumentFormat = 'markdown' | 'text' | 'docx' | 'pdf';

export interface ParsedDocument {
    format: DocumentFormat;
    /** 解析结果，统一是 Markdown，后面直接进 rag 的解析分块 */
    markdown: string;
}

export function detectFormat(filename: string): DocumentFormat | null {
    switch (extname(filename).toLowerCase()) {
        case '.md':
        case '.markdown':
            return 'markdown';
        case '.txt':
            return 'text';
        case '.docx':
            return 'docx';
        case '.pdf':
            return 'pdf';
        default:
            return null;
    }
}

/**
 * 把上传的文件解析成 Markdown。
 * 不支持的类型给明确提示，不要静默失败。
 */
export async function parseDocument(filename: string, buffer: Buffer): Promise<ParsedDocument> {
    const format = detectFormat(filename);

    switch (format) {
        case 'markdown':
        case 'text':
            return { format, markdown: normalizePlainText(buffer.toString('utf8')) };

        case 'docx':
            return { format, markdown: docxToMarkdown(buffer) };

        case 'pdf':
            return { format, markdown: await pdfToMarkdown(buffer) };

        default:
            throw new Error(
                `不支持的文件类型：${extname(filename) || '(无扩展名)'}，目前支持 md / txt / docx / pdf`,
            );
    }
}
