import type { Embedder } from '@corpus/core';

/**
 * 检索用的向量化器。
 *
 * 现在没有语义匹配能力，返回 null：检索退化成纯关键词（BM25）。
 * 以后接入语义匹配（作为额外功能/插件）时，在这里返回真正的 Embedder，
 * 分块、存储、检索的其余代码都不用动；
 * 已有数据的向量模型不同也没关系——chunks 里记着 embedding_model。
 */
export function getEmbedder(): Embedder | null {
    return null;
}

/** 没有向量时写进 chunks.embedding_model 的占位值 */
export const KEYWORD_ONLY_MODEL = 'keyword-only';
