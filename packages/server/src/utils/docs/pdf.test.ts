import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chunkDocument, parseMarkdown } from '@corpus/core';

import { pdfToMarkdown } from './pdf';

/**
 * 真实 PDF：test-files/民法典.pdf（530KB，中文法规）。
 * 全部 PDF 相关的回归都跑这个文件——既有标题结构，又有被换行拆碎的句子。
 */
const REAL_PDF = fileURLToPath(new URL('../../../test-files/民法典.pdf', import.meta.url));

const hasUnpdf = await import('unpdf').then(
    () => true,
    () => false,
);

const skip = hasUnpdf ? false : '未安装 unpdf：pnpm --filter @corpus/server add unpdf';

test('pdf：解析真实文件，正文完整且结构可用', { skip }, async () => {
    const markdown = await pdfToMarkdown(readFileSync(REAL_PDF));

    assert.ok(markdown.length > 100_000, `正文应该完整，实际 ${markdown.length} 字`);
    assert.match(markdown, /中华人民共和国民法典/);
    assert.match(markdown, /第一条/, '条文正文要抽出来');

    // 结构行被提升成标题：编 / 章 / 节三级
    assert.match(markdown, /^# 第一编 总则$/m);
    assert.match(markdown, /^## 第一章 基本规定$/m);
    assert.match(markdown, /^### 第一节 民事权利能力和民事行为能力$/m);
});

test('pdf：解析后切块，标题路径和行号都可用', { skip }, async () => {
    const markdown = await pdfToMarkdown(readFileSync(REAL_PDF));
    const document = { id: 'minfadian', title: '民法典', text: markdown };

    const sections = parseMarkdown(document);
    const chunks = chunkDocument(document, sections);

    assert.ok(sections.length > 50, `应该按章节切成多节，实际 ${sections.length} 节`);
    assert.ok(chunks.length > 100, `应该切出足够多的块，实际 ${chunks.length} 块`);

    // 每个块都要有可读的出处；唯一的例外是没有标题的前言（标题/属性信息）
    const preamble = chunks.filter((chunk) => chunk.headingPath.length === 0);

    assert.ok(preamble.length <= 1, '最多只有前言没有标题路径');
    assert.equal(chunks[0]?.headingPath.length, 0, '第一条应该是前言');

    for (const chunk of chunks.slice(1)) {
        assert.ok(chunk.headingPath.length > 0, `块 ${chunk.id} 缺少标题路径`);
        assert.ok(chunk.startLine <= chunk.endLine, `块 ${chunk.id} 行号颠倒`);
        assert.ok(chunk.text.trim().length >= 10, `块 ${chunk.id} 太短，属于噪声`);
    }

    // 行号要落在正文范围内，且不能每块都是全文范围
    const totalLines = markdown.split('\n').length;
    const spans = new Set(chunks.map((chunk) => `${chunk.startLine}-${chunk.endLine}`));

    for (const chunk of chunks) {
        assert.ok(chunk.endLine <= totalLines, '行号不能超出正文');
    }

    assert.ok(spans.size > chunks.length * 0.8, '每块的行号范围应该各不相同');
});

test('pdf：换行拆碎的句子被拼回（法规正文可读）', { skip }, async () => {
    const markdown = await pdfToMarkdown(readFileSync(REAL_PDF));

    // 「适应/中国特色社会主义」在 PDF 里被换行拆开，解析后应该连起来
    assert.match(markdown, /适应中国特色社会主义发展要求/);
    // 条文不允许在中间出现硬换行
    assert.ok(!markdown.includes('，适应\n中国特色'), '不应该保留 PDF 的硬换行');
});
