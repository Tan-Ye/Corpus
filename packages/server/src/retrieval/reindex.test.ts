import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ingestDocument } from './ingest';
import { reindexDocuments } from './reindex';
import { createRetrievalSchema } from './schema';
import { countChunks, listDocuments } from './store';

/** 真实样本：民法典（test-files/民法典.md） */
const MARKDOWN = readFileSync(
    fileURLToPath(new URL('../../test-files/民法典.md', import.meta.url)),
    'utf8',
);

const APPENDED = `${MARKDOWN}

# 附则

本附则是测试追加的一节，用来验证重建索引会读取磁盘上的最新内容。`;

function makeDb(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    createRetrievalSchema(db);
    return db;
}

test('重建索引：按磁盘上的 markdown 重新切块', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'corpus-reindex-'));
    const markdownPath = join(directory, 'minfadian.md');
    writeFileSync(markdownPath, MARKDOWN, 'utf8');

    const db = makeDb();
    const created = await ingestDocument(db, {
        title: '民法典',
        text: MARKDOWN,
        markdownPath,
    });

    assert.ok(created.chunkCount > 300);

    // 模拟「用户或解析器改了 markdown 文件」
    writeFileSync(markdownPath, APPENDED, 'utf8');

    const result = await reindexDocuments(db);

    assert.equal(result.rebuilt, 1);
    assert.deepEqual(result.skipped, []);
    assert.ok(countChunks(db) > created.chunkCount, '追加一节后块数应该增加');
    assert.equal(listDocuments(db).length, 1, '文档记录不能被重建掉');

    db.close();
    rmSync(directory, { recursive: true, force: true });
});

test('重建索引：没有 markdown 文件的文档跳过并给出原因', async () => {
    const db = makeDb();

    const created = await ingestDocument(db, { title: '粘贴的文档', text: MARKDOWN });

    const result = await reindexDocuments(db);

    assert.equal(result.rebuilt, 0);
    assert.equal(result.skipped.length, 1);
    assert.match(result.skipped[0]?.reason ?? '', /没有 markdown 文件/);
    assert.equal(countChunks(db), created.chunkCount, '跳过的文档原有索引要保留');

    db.close();
});

test('重建索引：markdown 文件丢失时跳过，不影响其他文档', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'corpus-reindex-'));
    const goodPath = join(directory, 'good.md');
    const lostPath = join(directory, 'lost.md');

    writeFileSync(goodPath, MARKDOWN, 'utf8');
    writeFileSync(lostPath, MARKDOWN, 'utf8');

    const db = makeDb();
    await ingestDocument(db, { title: '好的', text: MARKDOWN, markdownPath: goodPath });
    await ingestDocument(db, {
        title: '丢了的',
        text: `${MARKDOWN}\n\n# 另一节\n\n另一份内容。`,
        markdownPath: lostPath,
    });

    rmSync(lostPath);

    const result = await reindexDocuments(db);

    assert.equal(result.rebuilt, 1);
    assert.equal(result.skipped.length, 1);
    assert.match(result.skipped[0]?.reason ?? '', /读不到/);

    db.close();
    rmSync(directory, { recursive: true, force: true });
});
