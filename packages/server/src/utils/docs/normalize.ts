/** 统一换行、压缩连续空行，保证解析产物稳定可比 */
export function normalizePlainText(text: string): string {
    const normalized = text
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return `${normalized}\n`;
}
