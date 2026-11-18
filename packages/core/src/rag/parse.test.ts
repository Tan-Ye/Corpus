import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { SourceDoc } from '../types/docs';
import { parseMarkdown } from './parse';

/**
 * 真实样本：民法典（test-files/民法典.pdf 解析出来的 markdown）。
 *
 * markdown 相关的测试统一用这份文件，避免示例文本和真实文档结构脱节：
 * 它有编 / 章 / 节三级标题、几百行正文、以及一个没有标题的前言。
 */
const MARKDOWN_PATH = fileURLToPath(new URL('../../../server/test-files/民法典.md', import.meta.url));
const MARKDOWN = readFileSync(MARKDOWN_PATH, 'utf8');

const doc: SourceDoc = { id: 'minfadian', title: '民法典', text: MARKDOWN };

test('民法典：按编 / 章 / 节拆出多级 section', () => {
    const sections = parseMarkdown(doc);
    const paths = sections.map((section) => section.headingPath.join(' › '));

    assert.ok(sections.length >= 100, `应该拆出上百节，实际 ${sections.length}`);

    // 三个层级都要出现。只有标题没有正文的节会被跳过，
    // 所以「第一编 总则」单独一节不存在，要看它下面的叶子节。
    assert.ok(
        paths.some((path) => path.startsWith('第一编 总则 › 第一章 基本规定')),
        '缺少章级标题',
    );
    assert.ok(
        paths.includes('第一编 总则 › 第二章 自然人 › 第二节 监护'),
        '缺少节级标题',
    );
    assert.ok(paths.includes('第三编 合同 › 第九章 买卖合同'), '缺少合同编的章节');

    for (const section of sections) {
        assert.ok(
            section.headingPath.length <= 3,
            `标题层级超过三层：${section.headingPath.join(' › ')}`,
        );
        assert.ok(section.startLine <= section.endLine, '起止行不能颠倒');
    }
});

test('民法典：行号落在原文范围内，且每节各不相同', () => {
    const sections = parseMarkdown(doc);
    const totalLines = MARKDOWN.split('\n').length;

    for (const section of sections) {
        assert.ok(section.startLine >= 1, '行号从 1 开始');
        assert.ok(section.endLine <= totalLines, `行号超出正文：${section.endLine} > ${totalLines}`);
    }

    const starts = new Set(sections.map((section) => section.startLine));
    assert.ok(starts.size > 90, '每节的起始行应该基本不重复');
});

test('民法典：前言没有标题路径，正文从第一条开始', () => {
    const sections = parseMarkdown(doc);
    const [preamble] = sections;

    assert.deepEqual(preamble?.headingPath, [], '前言没有标题路径');
    assert.match(preamble?.text ?? '', /中华人民共和国民法典/);

    // 标题行本身不进正文
    assert.ok(!(preamble?.text ?? '').startsWith('# '));

    // 条文正文能定位到
    const article = sections.find((section) => section.text.includes('第一条'));
    assert.ok(article, '应该能解析到「第一条」');
    assert.ok((article?.headingPath.length ?? 0) > 0);
});

test('没有标题的纯文本整篇算一节（前言）', () => {
    // 用真实正文去掉所有标题行，模拟「扫描件抽出来的纯文本」
    const plain = MARKDOWN.split('\n')
        .filter((line) => !line.startsWith('#'))
        .join('\n');

    const sections = parseMarkdown({ ...doc, text: plain });

    assert.equal(sections.length, 1);
    assert.deepEqual(sections[0]?.headingPath, []);
    assert.ok((sections[0]?.text.length ?? 0) > 100_000);
});

test('代码块里的 # 不会被当成标题', () => {
    // 真实法规里没有代码块，这条是 markdown 语法本身的边界情况，用最小片段验证
    const sections = parseMarkdown({
        id: 'doc',
        title: '代码示例',
        text: ['# 真标题', '', '```bash', '# 这只是注释', 'echo hi', '```', '', '结尾正文。'].join('\n'),
    });

    assert.equal(sections.length, 1);
    assert.equal(sections[0]?.headingPath.length, 1);
    assert.match(sections[0]?.text ?? '', /# 这只是注释/);
});
