export { createRetrievalSchema } from './schema';
export { getEmbedder, KEYWORD_ONLY_MODEL } from './embedder';
export { hashMarkdown, ingestDocument } from './ingest';
export type { IngestInput, IngestResult } from './ingest';
export { searchChunks } from './search';
export type { SearchOptions, SearchResult } from './search';
export { buildRetrievalQuery } from './query';
export { reindexDocuments } from './reindex';
export type { ReindexResult } from './reindex';
export {
    bm25Search,
    countChunks,
    deleteDocument,
    findDocumentByHash,
    insertDocument,
    listDocuments,
    loadChunks,
    loadVectors,
    loadTermTexts,
} from './store';
export type { DocumentInput, DocumentRow, ExistingDocument } from './store';
