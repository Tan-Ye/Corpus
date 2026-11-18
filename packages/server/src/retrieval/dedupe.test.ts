import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { hashMarkdown, ingestDocument } from './ingest';
import { createRetrievalSchema } from './schema';
import { countChunks, findDocumentByHash, listDocuments } from './store';

/** 真实样本：民法典（test-files/民法典.md） */
const MARKDOWN = readFileSync(
    fileURLToPath(new URL('../../test-files/民法典.md', import.meta.url)),
    'utf8',
);

const EXTRA_SECTION = `\n\n# 附则\n\n本文件仅用于测试去重与重建索引，不属于法律条文。\n`;

function makeDb(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    createRetrievalSchema(db);
    return db;
}

test('内容哈希：换行符不同但内容相同 → 同一个哈希', () => {
    const crlf = MARKDOWN.replaceAll('\n', '\r\n');

    assert.equal(hashMarkdown(MARKDOWN), hashMarkdown(crlf));
    assert.notEqual(hashMarkdown(MARKDOWN), hashMarkdown(`${MARKDOWN}${EXTRA_SECTION}`));
});

test('重复入库：第二次直接返回已有文档，不再写库', async () => {
    const db = makeDb();

    const first = await ingestDocument(db, { title: '民法典', text: MARKDOWN });
    const chunksAfterFirst = countChunks(db);

    const second = await ingestDocument(db, { title: '换个标题', text: MARKDOWN });

    assert.equal(first.deduplicated, false);
    assert.equal(second.deduplicated, true, '第二次应该被去重');
    assert.equal(second.documentId, first.documentId, '返回同一篇文档');
    assert.equal(second.chunkCount, first.chunkCount);
    assert.equal(countChunks(db), chunksAfterFirst, 'chunk 数量不能翻倍');
    assert.equal(listDocuments(db).length, 1, '文档列表只能有一条');

    db.close();
});

test('内容不同：两篇都入库', async () => {
    const db = makeDb();

    await ingestDocument(db, { title: '民法典', text: MARKDOWN });
    await ingestDocument(db, { title: '民法典（补编）', text: `${MARKDOWN}${EXTRA_SECTION}` });

    assert.equal(listDocuments(db).length, 2);

    db.close();
});

test('findDocumentByHash：按哈希能找回已有文档', async () => {
    const db = makeDb();

    const created = await ingestDocument(db, { title: '民法典', text: MARKDOWN });
    const found = findDocumentByHash(db, hashMarkdown(MARKDOWN));

    assert.equal(found?.id, created.documentId);
    assert.equal(found?.chunkCount, created.chunkCount);
    assert.equal(findDocumentByHash(db, 'not-a-real-hash'), null);

    db.close();
});
