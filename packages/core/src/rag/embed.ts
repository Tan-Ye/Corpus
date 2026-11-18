import type { Embedder } from '../types/docs';

const CJK_RUN = /[\u4e00-\u9fff]+/g;
const LATIN_WORD = /[a-z0-9_]+/g;

/**
 * 粗粒度分词：英文按词、中文按二元组。
 *
 * 中文没有空格，不切词整段会变成一个 token；二元组（「分块」→ 分块）
 * 足够支撑关键词检索，也不需要引入分词库。
 */
export function tokenize(text: string): string[] {
    const lowered = text.toLowerCase();

    const latin = lowered.match(LATIN_WORD) ?? [];
    const cjkRuns = lowered.match(CJK_RUN) ?? [];

    const bigrams = cjkRuns.flatMap((run) => {
        if (run.length === 1) {
            return [run];
        }

        return Array.from({ length: run.length - 1 }, (_, index) => run.slice(index, index + 2));
    });

    return [...latin, ...bigrams];
}

/** FNV-1a：把 token 稳定地映射到 [0, dim) */
function hashToken(token: string): number {
    let hash = 2166136261;

    for (const char of token) {
        hash ^= char.codePointAt(0) ?? 0;
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}

export function normalizeVector(vector: number[]): number[] {
    const length = Math.hypot(...vector);

    if (length === 0) {
        return vector;
    }

    return vector.map((value) => value / length);
}

/**
 * 本地哈希向量：不调任何 API。
 *
 * 它**没有语义能力**，只保证整条链路能离线跑通（解析 → 分块 → 向量 → 检索）。
 * 接入真实 embedding 服务后换 createApiEmbedder，其余代码不动。
 */
export function createHashingEmbedder(dim = 256): Embedder {
    return {
        name: `hashing-${dim}`,
        dim,
        async embed(texts) {
            return texts.map((text) => {
                const vector = Array.from({ length: dim }, () => 0);

                for (const token of tokenize(text)) {
                    const index = hashToken(token) % dim;
                    vector[index] = (vector[index] ?? 0) + 1;
                }

                return normalizeVector(vector);
            });
        },
    };
}

/**
 * OpenAI 兼容的 embedding 实现。
 * 注意：DeepSeek 目前没有 /embeddings 接口，需要换一个兼容服务。
 */
export function createApiEmbedder(options: {
    baseUrl: string;
    apiKey: string;
    model: string;
    dim: number;
    batchSize?: number;
}): Embedder {
    const endpoint = `${options.baseUrl.replace(/\/+$/, '')}/embeddings`;
    const batchSize = options.batchSize ?? 64;

    return {
        name: options.model,
        dim: options.dim,
        async embed(texts) {
            const vectors: number[][] = [];

            // 批量提交：1000 个 chunk 分 16 批，而不是 1000 次请求
            for (let offset = 0; offset < texts.length; offset += batchSize) {
                const batch = texts.slice(offset, offset + batchSize);

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        authorization: `Bearer ${options.apiKey}`,
                    },
                    body: JSON.stringify({ model: options.model, input: batch }),
                });

                if (!response.ok) {
                    throw new Error(`embedding 请求失败：${response.status} ${await response.text()}`);
                }

                const body = (await response.json()) as { data: { embedding: number[] }[] };
                vectors.push(...body.data.map((item) => normalizeVector(item.embedding)));
            }

            return vectors;
        },
    };
}
