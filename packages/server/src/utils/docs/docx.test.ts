import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { docxToMarkdown } from './docx';
import { parseDocument } from './index';

/** 用 python-docx 生成的样本：两级标题 + 两段正文 */
const FIXTURE = fileURLToPath(new URL('./__fixtures__/sample.docx', import.meta.url));

test('docx：标题按 Heading 样式还原成 markdown 标题', () => {
    const markdown = docxToMarkdown(readFileSync(FIXTURE));

    console.log(markdown);

    assert.match(markdown, /^# 分块策略$/m, '一级标题');
    assert.match(markdown, /^## 按标题切分$/m, '二级标题');
    assert.match(markdown, /太长、太贵、太散/, '正文段落要保留');
    assert.match(markdown, /locator/, '第二段正文要保留');
});

test('parseDocument：按扩展名分发，不支持的扩展名给明确报错', async () => {
    const markdownDoc = await parseDocument('note.md', Buffer.from('# 标题\n\n正文内容'));

    assert.equal(markdownDoc.format, 'markdown');
    assert.match(markdownDoc.markdown, /# 标题/);

    await assert.rejects(
        () => parseDocument('legacy.doc', Buffer.from('x')),
        /不支持的文件类型/,
        '.doc 是旧格式，不支持要明说',
    );
});
