import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { TextChunk } from '@corpus/core';

import { ingestDocument } from './ingest';
import { createRetrievalSchema } from './schema';
import {
    bm25Search,
    countChunks,
    deleteDocument,
    getDocumentById,
    insertDocument,
    listDocuments,
    loadChunks,
    loadVectors,
    renameDocument,
} from './store';

/** 真实样本：民法典（test-files/民法典.md） */
const MARKDOWN = readFileSync(
    fileURLToPath(new URL('../../test-files/民法典.md', import.meta.url)),
    'utf8',
);

const EMBEDDER = { name: 'test-embedder', dim: 4 };

function makeDb(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    createRetrievalSchema(db);
    return db;
}

function makeChunk(id: string, text: string, headingPath: string[] = ['根', '节']): TextChunk {
    return {
        id,
        documentId: 'doc-1',
        documentTitle: '测试文档',
        headingPath,
        startLine: 1,
        endLine: 3,
        text,
    };
}

test('建表：重复执行 schema 不报错（迁移与测试共用）', () => {
    const db = makeDb();
    createRetrievalSchema(db); // 第二次
    assert.equal(countChunks(db), 0);
    db.close();
});

test('入库：真实文档的 chunks 与全文索引一一对应', async () => {
    const db = makeDb();
    const result = await ingestDocument(db, { title: '民法典', text: MARKDOWN });

    const ftsCount = (db.prepare('SELECT COUNT(*) AS c FROM chunks_fts').get() as { c: number }).c;

    assert.ok(result.chunkCount > 300, `应该切出足够多的块，实际 ${result.chunkCount}`);
    assert.equal(countChunks(db), result.chunkCount);
    assert.equal(ftsCount, result.chunkCount, '每块都要进全文索引');

    const documents = listDocuments(db);
    assert.equal(documents.length, 1);
    assert.equal(documents[0]?.chunkCount, result.chunkCount);

    db.close();
});

test('BM25：按条文关键词召回，带回标题路径和 locator', async () => {
    const db = makeDb();
    await ingestDocument(db, { title: '民法典', text: MARKDOWN });

    const hits = bm25Search(db, '试用买卖');
    assert.ok(hits.length > 0, '应该能召回');

    const [top] = hits;
    const chunks = loadChunks(db, [top?.chunkId ?? '']);
    const chunk = chunks.get(top?.chunkId ?? '');

    assert.ok(chunk?.headingPath.join(' › ').includes('买卖合同'), '应该命中买卖合同章');
    assert.ok((chunk?.startLine ?? 0) > 0);
    assert.ok(chunk?.text.includes('试用'));

    // 纯拉丁的假词，不会在中文法规里出现
    assert.deepEqual(bm25Search(db, 'zzzqqqxxx'), []);

    db.close();
});

test('向量：Float32 存取往返一致', () => {
    const db = makeDb();
    insertDocument(
        db,
        { id: 'doc-1', title: '测试文档' },
        [makeChunk('c1', '内容')],
        [[0.25, -0.5, 0.75, 1]],
        EMBEDDER,
    );

    const vectors = loadVectors(db);
    const vector = vectors.get('c1');

    assert.ok(vector instanceof Float32Array);
    assert.equal(vector.length, 4);
    assert.deepEqual([...vector], [0.25, -0.5, 0.75, 1]);

    db.close();
});

test('重命名文档：库、chunks、全文索引一起更新', async () => {
    const db = makeDb();
    await ingestDocument(db, { title: '民法典', text: MARKDOWN });

    const [document] = listDocuments(db);
    const id = document?.id ?? '';

    assert.equal(renameDocument(db, id, '合同法注释'), true);
    assert.equal(getDocumentById(db, id)?.title, '合同法注释');

    // chunks 里的冗余标题也要改，否则引用里还显示旧标题
    const chunkTitle = (
        db.prepare('SELECT document_title AS title FROM chunks WHERE document_id = ? LIMIT 1').get(id) as {
            title: string;
        }
    ).title;
    assert.equal(chunkTitle, '合同法注释');

    // 新标题进入全文索引：正文里没有「注释」二字也能搜到
    assert.ok(bm25Search(db, '注释').length > 0, '新标题应该可检索');

    assert.equal(renameDocument(db, 'not-exist', '随便'), false);

    db.close();
});

test('查询单篇文档：打开原文用', async () => {
    const db = makeDb();
    await ingestDocument(db, { title: '民法典', text: MARKDOWN });

    const [document] = listDocuments(db);
    const found = getDocumentById(db, document?.id ?? '');

    assert.equal(found?.id, document?.id);
    assert.equal(found?.title, '民法典');
    assert.equal(found?.chunkCount, document?.chunkCount);
    assert.equal(getDocumentById(db, 'not-exist'), null);

    db.close();
});

test('删除：文档、chunks、全文索引一起清掉', async () => {
    const db = makeDb();
    await ingestDocument(db, { title: '民法典', text: MARKDOWN });

    assert.equal(deleteDocument(db, 'not-exist'), false);

    const [document] = listDocuments(db);
    assert.equal(deleteDocument(db, document?.id ?? ''), true);
    assert.equal(countChunks(db), 0);
    assert.equal(listDocuments(db).length, 0);
    assert.equal((db.prepare('SELECT COUNT(*) AS c FROM chunks_fts').get() as { c: number }).c, 0);

    db.close();
});
