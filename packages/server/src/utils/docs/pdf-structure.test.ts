import assert from 'node:assert/strict';
import { test } from 'node:test';

import { looksStructured, normalizePdfMarkdown } from './pdf-structure';

/** 取自真实 PDF（民法典）的几行：结构行 + 被换行拆碎的句子 */
const LEGAL = `中华人民共和国民法典
第一编 总则
第一章 基本规定
第一条 【立法目的】为了保护民事主体的合法权益，调整民事关系，维护社会和经济秩序，适应
中国特色社会主义发展要求，弘扬社会主义核心价值观，根据宪法，制定本法。
第二条 【调整范围】民法调整平等主体的自然人、法人和非法人组织之间的人身关系和财产关
系。
第一节 民事权利能力和民事行为能力
第十三条 【自然人民事权利能力的起止】自然人从出生时起到死亡时止，具有民事权利能力，依
法享有民事权利，承担民事义务。`;

test('结构识别：法规式文本才处理', () => {
    assert.equal(looksStructured(LEGAL), true);
    assert.equal(looksStructured('普通的一篇文章，只有正文，没有编章节。'), false);
});

test('编/章/节 → 标题，条 → 段落边界', () => {
    const markdown = normalizePdfMarkdown(LEGAL);

    assert.match(markdown, /^# 第一编 总则$/m, '编是 H1');
    assert.match(markdown, /^## 第一章 基本规定$/m, '章是 H2');
    assert.match(markdown, /^### 第一节 民事权利能力和民事行为能力$/m, '节是 H3');

    // 条不提升为标题，但要独立成段
    assert.match(markdown, /^第一条 【立法目的】/m);
    assert.ok(!markdown.includes('# 第一条'));
});

test('被换行拆碎的句子会拼回去', () => {
    const markdown = normalizePdfMarkdown(LEGAL);

    assert.match(markdown, /适应中国特色社会主义发展要求/, '中文拼接不加空格');
    assert.match(markdown, /依法享有民事权利，承担民事义务/, '跨行句子要连起来');
    assert.ok(!markdown.includes('适应\n中国特色社会主义'), '不能留下硬换行');
});

test('英文行尾拼接补空格，已有 markdown 标题保持原样', () => {
    const markdown = normalizePdfMarkdown(
        ['# 已有标题', 'The quick brown fox', 'jumps over the lazy dog.', '第二段。'].join('\n'),
    );

    assert.match(markdown, /# 已有标题/);
    assert.match(markdown, /The quick brown fox jumps over the lazy dog\./, '英文要补空格');
    assert.match(markdown, /第二段。/);
});
