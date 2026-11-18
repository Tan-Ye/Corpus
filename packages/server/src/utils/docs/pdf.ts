import { normalizePdfMarkdown } from './pdf-structure';

/**
 * pdf → Markdown。
 *
 * PDF 里没有段落结构，只有带坐标的文字片段，抽出来只能恢复成纯文本。
 * 所以这里先过一遍 normalizePdfMarkdown：
 * 合并被换行拆碎的句子，把「第X编/章/节」提升成标题，
 * 这样入库后才有多级的 headingPath 和可用的行号定位。
 *
 * 依赖是可选的：没装 unpdf 时给一句明确的安装提示，而不是模块找不到。
 */
export async function pdfToMarkdown(buffer: Buffer): Promise<string> {
    let unpdf: typeof import('unpdf');

    try {
        unpdf = await import('unpdf');
    } catch {
        throw new Error('PDF 解析需要先安装依赖：pnpm --filter @corpus/server add unpdf');
    }

    const { text } = await unpdf.extractText(new Uint8Array(buffer), { mergePages: true });
    const merged = Array.isArray(text) ? text.join('\n\n') : text;

    return normalizePdfMarkdown(merged);
}
