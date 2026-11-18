import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { SourceDoc } from '../types/docs';
import { CHUNK_OVERLAP_CHARS, MAX_CHUNK_CHARS, chunkDocument } from './chunk';
import { parseMarkdown } from './parse';

/** 真实样本：民法典（test-files/民法典.md），切块相关的断言都对它做 */
const MARKDOWN_PATH = fileURLToPath(new URL('../../../server/test-files/民法典.md', import.meta.url));
const MARKDOWN = readFileSync(MARKDOWN_PATH, 'utf8');

const doc: SourceDoc = { id: 'minfadian', title: '民法典', text: MARKDOWN };
const sections = parseMarkdown(doc);
const chunks = chunkDocument(doc, sections);

const BOUNDARIES = new Set(['。', '！', '？', '；', '!', '?', ';', '：', ':', '】', '）', ')', '\n']);

test('民法典：每节成块，id 唯一且连续', () => {
    assert.ok(chunks.length >= 300, `应该切出足够多的块，实际 ${chunks.length}`);

    const ids = new Set(chunks.map((chunk) => chunk.id));
    assert.equal(ids.size, chunks.length, 'chunk id 必须唯一');

    assert.deepEqual(
        chunks.map((chunk) => chunk.id).slice(0, 3),
        ['minfadian#0', 'minfadian#1', 'minfadian#2'],
        'id 从 0 开始连续编号',
    );
});

test('民法典：块长不超上限，且都带可用的标题路径和行号', () => {
    const totalLines = MARKDOWN.split('\n').length;
    // 上限 + 重叠尾巴 + 尾巴和正文之间的空行
    const MAX_LENGTH = MAX_CHUNK_CHARS + CHUNK_OVERLAP_CHARS + 2;

    for (const chunk of chunks) {
        assert.ok(chunk.text.length <= MAX_LENGTH, `块 ${chunk.id} 超长：${chunk.text.length}`);
        assert.ok(chunk.startLine >= 1 && chunk.endLine <= totalLines, '行号要在正文范围内');
        assert.ok(chunk.startLine <= chunk.endLine, '起止行不能颠倒');
    }

    // 唯一的例外是没有标题的前言
    const preamble = chunks.filter((chunk) => chunk.headingPath.length === 0);
    assert.equal(preamble.length, 1, '只有前言没有标题路径');
    assert.equal(chunks[0]?.headingPath.length, 0);

    for (const chunk of chunks.slice(1)) {
        assert.ok(chunk.headingPath.length > 0, `块 ${chunk.id} 缺少标题路径`);
    }
});

test('民法典：硬切不切半句话', () => {
    // 最后一块可能停在文档结尾，允许不带标点
    for (const chunk of chunks.slice(0, -1)) {
        const tail = chunk.text.trimEnd().at(-1) ?? '';
        assert.ok(BOUNDARIES.has(tail), `块 ${chunk.id} 结尾不是句子边界：「…${chunk.text.slice(-12)}」`);
    }
});

test('民法典：行号能定位到具体条文，不是全文范围', () => {
    const spans = new Set(chunks.map((chunk) => `${chunk.startLine}-${chunk.endLine}`));

    assert.ok(
        spans.size > chunks.length * 0.9,
        `每块的行号范围应该基本不同，实际只有 ${spans.size} 种`,
    );

    const article = chunks.find((chunk) => chunk.text.includes('第六百三十七条'));
    assert.ok(article, '应该能切到「第六百三十七条」所在的块');
    assert.ok((article?.headingPath.join(' › ') ?? '').includes('买卖合同'));
    assert.ok(article?.text.includes('由出卖人确定。'), '条文正文要完整，不能截在中间');
});

test('同一节的相邻块之间带重叠', () => {
    // 找一节被切成多块的（自然人 · 监护大约 2000 字）
    const group = chunks.filter((chunk) =>
        chunk.headingPath.join(' › ').includes('第二节 监护'),
    );

    assert.ok(group.length >= 2, '这一节应该被切成多块');

    const [first, second] = group;
    const tail = (first?.text ?? '').slice(-CHUNK_OVERLAP_CHARS).trim();

    assert.ok(tail.length > 0);
    assert.ok(second?.text.startsWith(tail), '第二块应该以上一块的尾巴开头');
});

test('空文档不产生块', () => {
    const empty: SourceDoc = { id: 'empty', title: '空文档', text: '   \n\n  ' };

    assert.deepEqual(chunkDocument(empty, parseMarkdown(empty)), []);
});
