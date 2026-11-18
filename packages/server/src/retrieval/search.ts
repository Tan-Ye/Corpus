import type { DatabaseSync } from 'node:sqlite';

import { tokenize } from '@corpus/core';
import type { Embedder, RetrievedChunk } from '@corpus/core';

import { bm25Search, loadChunks, loadTermTexts, loadVectors } from './store';

export interface SearchOptions {
    /**
     * 语义匹配用的向量化器。
     * 不传 = 纯关键词检索（当前默认）；传了才做向量召回与混合打分。
     */
    embedder?: Embedder | null;
    /** 返回几条，默认 5 */
    limit?: number;
    /** 最高分低于它就算「资料里没有」，默认 0.25 */
    threshold?: number;
    /** 有向量时的关键词权重，剩下的给向量，默认 0.55 */
    keywordWeight?: number;
}

export interface SearchResult {
    hits: RetrievedChunk[];
    /** 一条都没命中，或者最高分低于阈值 */
    belowThreshold: boolean;
}

function dot(left: ArrayLike<number>, right: ArrayLike<number>): number {
    const length = Math.min(left.length, right.length);
    let sum = 0;

    for (let index = 0; index < length; index += 1) {
        sum += (left[index] ?? 0) * (right[index] ?? 0);
    }

    return sum;
}

/**
 * 检索：关键词（BM25）为主，传了 embedder 才叠加向量召回。
 *
 * 只用关键词，问法和原文措辞不一致就召回不到；
 * 只用向量，函数名、编号这类精确串又会变差。
 */
export async function searchChunks(
    db: DatabaseSync,
    query: string,
    options: SearchOptions = {},
): Promise<SearchResult> {
    const embedder = options.embedder ?? null;
    const limit = options.limit ?? 5;
    const threshold = options.threshold ?? 0.25;
    const keywordWeight = options.keywordWeight ?? 0.55;

    const keywordHits = bm25Search(db, query, limit * 4);
    const queryTerms = [...new Set(tokenize(query))];

    const candidates = new Set(keywordHits.map((hit) => hit.chunkId));
    const vectorScores = new Map<string, number>();
    /** 没有向量时用「查询词命中覆盖率」判断置信度：命中的查询词越少，越像「资料里没有」 */
    const coverageScores = new Map<string, number>();

    if (embedder) {
        const [queryVector] = await embedder.embed([query]);
        const vectors = loadVectors(db);

        if (queryVector) {
            for (const [chunkId, vector] of vectors) {
                const score = dot(queryVector, vector);
                vectorScores.set(chunkId, score);

                // 向量分太低的丢掉，避免候选集被稀释
                if (score > 0.12) {
                    candidates.add(chunkId);
                }
            }
        }
    } else if (queryTerms.length > 0) {
        const termTexts = loadTermTexts(db, [...candidates]);

        for (const chunkId of candidates) {
            const terms = termTexts.get(chunkId) ?? '';
            const matched = queryTerms.filter((term) => terms.includes(term)).length;

            coverageScores.set(chunkId, matched / queryTerms.length);
        }
    }

    const bestKeyword = Math.max(0, ...keywordHits.map((hit) => hit.score));
    const keywordScores = new Map(
        keywordHits.map((hit) => [hit.chunkId, bestKeyword > 0 ? hit.score / bestKeyword : 0]),
    );

    const chunks = loadChunks(db, [...candidates]);
    const hits: RetrievedChunk[] = [];

    for (const chunkId of candidates) {
        const chunk = chunks.get(chunkId);

        if (!chunk) {
            continue;
        }

        const keywordScore = keywordScores.get(chunkId) ?? 0;
        const vectorScore = Math.max(0, vectorScores.get(chunkId) ?? 0);

        // 有向量：关键词 + 语义加权
        // 没有向量：覆盖率当闸门（决定「算不算命中」），BM25 相对分决定排序先后
        const score = embedder
            ? keywordWeight * keywordScore + (1 - keywordWeight) * vectorScore
            : (coverageScores.get(chunkId) ?? 0) * keywordScore;

        hits.push({ chunk, score, keywordScore, vectorScore });
    }

    hits.sort((left, right) => right.score - left.score);

    const top = hits.slice(0, limit);
    const belowThreshold = top.length === 0 || (top[0]?.score ?? 0) < threshold;

    return { hits: belowThreshold ? [] : top, belowThreshold };
}
