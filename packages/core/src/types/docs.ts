/** 一篇源文档 */
export interface SourceDoc {
    id: string;
    title: string;
    /** 来源：文件路径 / URL / 手动输入，只为追溯，不参与检索 */
    path?: string;
    text: string;
}

/** 按标题切出来的一段 */
export interface Section {
    headingPath: string[];
    text: string;
    startLine: number;
    endLine: number;
}

/** 入库的最小单位：一块正文 + 它的定位信息（locator） */
export interface TextChunk {
    id: string;
    documentId: string;
    documentTitle: string;
    headingPath: string[];
    startLine: number;
    endLine: number;
    text: string;
}

/** 一条检索结果 */
export interface RetrievedChunk {
    chunk: TextChunk;
    /** 混合总分，0~1 */
    score: number;
    /** 关键词（BM25）归一化后的分 */
    keywordScore: number;
    /** 向量余弦分 */
    vectorScore: number;
}

/**
 * 向量化器。
 *
 * 换 embedding 模型只换这个实现，分块、存储、检索都不用动
 * （architecture §9.2：chunk 上记录 model/dim，就是为了能按模型分批重建）。
 */
export interface Embedder {
    /** 写进 chunks.embedding_model，换模型时靠它区分索引 */
    name: string;
    dim: number;
    embed(texts: string[]): Promise<number[][]>;
}
