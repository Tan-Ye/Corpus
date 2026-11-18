import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chunkDocument, createHashingEmbedder, parseMarkdown, tokenize } from '@corpus/core';
import type { SourceDoc } from '@corpus/core';

import { ingestDocument } from './ingest';
import { createRetrievalSchema } from './schema';
import { searchChunks } from './search';
import { countChunks, listDocuments } from './store';

/**
 * 文档解析到检索的流程测试。
 *
 * 样本是真实文件 test-files/民法典.md（由同目录 PDF 解析得到），
 * 每一步只验证一个环节并打印中间结果，出问题时能直接定位是哪一层坏了。
 */

const MARKDOWN = readFileSync(
    fileURLToPath(new URL('../../test-files/民法典.md', import.meta.url)),
    'utf8',
);

const doc: SourceDoc = {
    id: 'minfadian',
    title: '民法典',
    text: MARKDOWN,
};

test('步骤 1 · 解析：切出带标题路径和行号的 section', () => {
    const sections = parseMarkdown(doc);

    console.log(`  切出 ${sections.length} 节：`);
    for (const section of sections.slice(0, 5)) {
        console.log(
            `  - ${section.headingPath.join(' › ') || '（前言）'} (L${section.startLine}-${section.endLine})`,
        );
    }

    assert.ok(sections.length >= 100);

    const paths = sections.map((section) => section.headingPath.join(' › '));
    assert.ok(paths.includes('第一编 总则 › 第二章 自然人 › 第二节 监护'));
    assert.ok(paths.includes('第三编 合同 › 第九章 买卖合同'));

    const totalLines = MARKDOWN.split('\n').length;
    for (const section of sections) {
        assert.ok(section.endLine <= totalLines, '行号不能超出原文');
        assert.ok(section.startLine < section.endLine, '起止行不能颠倒');
    }
});

test('步骤 2 · 分块：每节成块，id 唯一，locator 指向条文', () => {
    const chunks = chunkDocument(doc, parseMarkdown(doc));

    console.log(`  切成 ${chunks.length} 块`);
    for (const chunk of chunks.slice(0, 3)) {
        console.log(
            `  - ${chunk.id}  ${chunk.headingPath.join(' › ') || '（前言）'}  L${chunk.startLine}-${chunk.endLine}  ${chunk.text.length} 字`,
        );
    }

    assert.ok(chunks.length >= 300);

    const ids = new Set(chunks.map((chunk) => chunk.id));
    assert.equal(ids.size, chunks.length, 'chunk id 必须唯一');

    for (const chunk of chunks) {
        assert.ok(chunk.startLine <= chunk.endLine, '行号要合法');
    }

    // 只有前言没有标题路径
    const withoutPath = chunks.filter((chunk) => chunk.headingPath.length === 0);
    assert.equal(withoutPath.length, 1);
});

test('步骤 3 · 向量化：输出定长、已归一化、同样输入结果一致', async () => {
    const embedder = createHashingEmbedder(64);
    const texts = ['分块要控制长度', '标题天然是语义边界'];

    const [firstRun] = await embedder.embed(texts);
    const [secondRun] = await embedder.embed(texts);

    console.log(
        `  分词结果：${tokenize(texts[0] ?? '')
            .slice(0, 8)
            .join(' / ')} …`,
    );
    console.log(
        `  向量维度：${firstRun?.length}，模长：${Math.hypot(...(firstRun ?? [])).toFixed(4)}`,
    );

    assert.equal(firstRun?.length, 64);
    assert.deepEqual(firstRun, secondRun, '同一个 embedder 对同一段文本必须稳定');

    const length = Math.hypot(...(firstRun ?? []));
    assert.ok(Math.abs(length - 1) < 1e-6, '向量应该是单位向量');

    const [secondVector] = await embedder.embed([texts[1] ?? '']);
    assert.notDeepEqual(firstRun, secondVector);
});

test('步骤 4 · 入库：文档、chunks、全文索引三处同时写入', async () => {
    const db = new DatabaseSync(':memory:');
    createRetrievalSchema(db);

    const result = await ingestDocument(
        db,
        { title: '民法典', text: MARKDOWN },
        createHashingEmbedder(64),
    );

    const documents = listDocuments(db);
    const ftsCount = (db.prepare('SELECT COUNT(*) AS c FROM chunks_fts').get() as { c: number }).c;

    console.log(`  文档 ${documents.length} 篇，chunks ${countChunks(db)} 块，fts ${ftsCount} 行`);
    console.log(`  入库结果：${JSON.stringify(result)}`);

    assert.equal(documents.length, 1);
    assert.equal(documents[0]?.title, '民法典');
    assert.equal(Number(documents[0]?.chunkCount), result.chunkCount);
    assert.equal(countChunks(db), result.chunkCount);
    assert.equal(ftsCount, result.chunkCount, '每块都要进全文索引');

    db.close();
});

test('步骤 5 · 检索：命中正确章节，并带回 locator', async () => {
    const db = new DatabaseSync(':memory:');
    createRetrievalSchema(db);

    const embedder = createHashingEmbedder(64);
    await ingestDocument(db, { title: '民法典', text: MARKDOWN }, embedder);

    const result = await searchChunks(db, '试用买卖的试用期限', { embedder, limit: 3 });

    console.log(`  belowThreshold=${result.belowThreshold}`);
    for (const hit of result.hits) {
        console.log(
            `  - [${hit.score.toFixed(2)}] ${hit.chunk.headingPath.join(' › ')} (L${hit.chunk.startLine}-${hit.chunk.endLine})`,
        );
    }

    assert.ok(result.hits.length > 0, '应该能检索到内容');

    const top = result.hits[0];
    assert.ok(
        top?.chunk.headingPath.join(' › ').includes('买卖合同'),
        '首条命中应该在买卖合同章',
    );
    assert.equal(top?.chunk.documentTitle, '民法典');
    assert.ok((top?.chunk.endLine ?? 0) >= (top?.chunk.startLine ?? 0));

    db.close();
});

test('步骤 6 · 拒答：最高分低于阈值时返回空结果', async () => {
    const db = new DatabaseSync(':memory:');
    createRetrievalSchema(db);

    await ingestDocument(db, { title: '民法典', text: MARKDOWN });

    // 分数上限是 1.0，1.1 必然高于任何得分
    const result = await searchChunks(db, '试用买卖', { threshold: 1.1 });

    console.log(
        `  阈值 1.1 时：belowThreshold=${result.belowThreshold}, hits=${result.hits.length}`,
    );

    assert.equal(result.belowThreshold, true);
    assert.equal(result.hits.length, 0, '拒答时不返回任何片段');

    const normal = await searchChunks(db, '试用买卖');
    assert.ok(normal.hits.length > 0, '默认阈值下应该有命中');

    db.close();
});
