/**
 * unpdf 是可选依赖：装了才能解析 PDF。
 * 这里只声明用到的部分，避免没装时整个项目类型报错。
 */
declare module 'unpdf' {
    export function extractText(
        data: Uint8Array,
        options?: { mergePages?: boolean },
    ): Promise<{ totalPages: number; text: string | string[] }>;
}
