import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createHashingEmbedder } from '@corpus/core';

import { ingestDocument } from './ingest';
import { createRetrievalSchema } from './schema';
import { searchChunks } from './search';

/** 真实样本：民法典（test-files/民法典.md） */
const MARKDOWN = readFileSync(
    fileURLToPath(new URL('../../test-files/民法典.md', import.meta.url)),
    'utf8',
);

/** embedder 传 false 时模拟「没有语义匹配能力」的默认状态 */
async function makeIndexedDb(withEmbedder: boolean) {
    const db = new DatabaseSync(':memory:');
    createRetrievalSchema(db);

    const embedder = withEmbedder ? createHashingEmbedder(64) : null;
    await ingestDocument(db, { title: '民法典', text: MARKDOWN }, embedder);

    return { db, embedder };
}

test('纯关键词检索：命中买卖合同章，向量分为 0', async () => {
    const { db } = await makeIndexedDb(false);

    const result = await searchChunks(db, '试用买卖');
    const top = result.hits[0];

    assert.equal(result.belowThreshold, false);
    assert.ok(top, '关键词检索应该有命中');
    assert.equal(top.chunk.documentTitle, '民法典');
    assert.ok(top.chunk.headingPath.join(' › ').includes('买卖合同'));
    assert.ok(top.keywordScore > 0);
    assert.equal(top.vectorScore, 0, '没有 embedder 就不该有向量分');
    assert.ok(top.score > 0 && top.score <= top.keywordScore);

    db.close();
});

test('混合检索：传了 embedder 才叠加向量分', async () => {
    const { db, embedder } = await makeIndexedDb(true);

    const result = await searchChunks(db, '监护人的职责', { embedder });
    const top = result.hits[0];

    assert.ok(top);
    assert.ok(top.vectorScore > 0, '有 embedder 时应该有向量分');
    assert.ok(top.score > 0);

    db.close();
});

test('拒答：阈值高于理论上限时返回空', async () => {
    const { db } = await makeIndexedDb(false);

    const result = await searchChunks(db, '试用买卖', { threshold: 1.1 });

    assert.equal(result.belowThreshold, true);
    assert.deepEqual(result.hits, []);

    db.close();
});

test('权重：只在有向量时生效', async () => {
    const { db, embedder } = await makeIndexedDb(true);

    const keywordOnly = await searchChunks(db, '试用买卖', { embedder, keywordWeight: 1 });
    assert.ok(keywordOnly.hits.length > 0);
    assert.ok((keywordOnly.hits[0]?.keywordScore ?? 0) > 0);

    const vectorOnly = await searchChunks(db, '试用买卖', { embedder, keywordWeight: 0 });
    assert.ok(vectorOnly.hits.length > 0);
    assert.ok((vectorOnly.hits[0]?.score ?? 0) > 0);

    db.close();
});

test('无关查询：没有候选时直接判为资料里没有', async () => {
    const { db } = await makeIndexedDb(false);

    const result = await searchChunks(db, 'zzzzqqqqxxxx');

    assert.equal(result.belowThreshold, true);
    assert.deepEqual(result.hits, []);

    db.close();
});

test('limit：返回条数不超过上限', async () => {
    const { db } = await makeIndexedDb(false);

    const result = await searchChunks(db, '合同', { limit: 1, threshold: 0 });

    assert.ok(result.hits.length <= 1);

    db.close();
});
