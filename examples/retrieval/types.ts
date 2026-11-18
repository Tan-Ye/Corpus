/** 一篇源文档 */
export interface SourceDoc {
    id: string;
    title: string;
    path: string;
    text: string;
}

/** 按标题切出来的一段 */
export interface Section {
    headingPath: string[];
    text: string;
    startLine: number;
    endLine: number;
}

/** 入库的最小单位：一块正文 + 它的定位 */
export interface Chunk {
    id: string;
    docId: string;
    docTitle: string;
    headingPath: string[];
    startLine: number;
    endLine: number;
    text: string;
}

/** 一条检索结果 */
export interface SearchHit {
    chunk: Chunk;
    score: number;
    bm25Score: number;
    cosineScore: number;
}

/**
 * 向量化器。
 * 换模型只换实现，检索和存储都不用动——这就是 architecture §9.2 说的「模型可替换」。
 */
export interface Embedder {
    /** 记进 chunks 表，换模型时靠它区分索引 */
    name: string;
    dim: number;
    embed(texts: string[]): Promise<number[][]>;
}
