import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Message } from '@corpus/core/types';

import { buildRetrievalQuery } from './query';

function user(content: string): Message {
    return { role: 'user', content };
}

function assistant(content: string): Message {
    return { role: 'assistant', content };
}

test('独立问题：直接用它自己检索', () => {
    const query = buildRetrievalQuery([
        user('分块策略里块大小怎么定？'),
        assistant('300 到 1000 字比较合适。'),
        user('定位信息应该怎么存比较稳妥？'),
    ]);

    assert.equal(query, '定位信息应该怎么存比较稳妥？');
});

test('短追问：带上上一轮提问一起检索', () => {
    const query = buildRetrievalQuery([
        user('引用为什么必须是原文片段？'),
        assistant('因为改写过的片段无法核对。'),
        user('第二点呢'),
    ]);

    assert.equal(query, '引用为什么必须是原文片段？\n第二点呢');
});

test('指代词开头：也当追问处理', () => {
    const query = buildRetrievalQuery([
        user('文档库支持哪些格式？'),
        assistant('Markdown、纯文本、docx、pdf。'),
        user('这个和 PDF 解析是一回事吗？'),
    ]);

    assert.match(query, /^文档库支持哪些格式？\n/);
});

test('只有一句：原样返回；空会话返回空字符串', () => {
    assert.equal(buildRetrievalQuery([user('只有这一句的完整问题，长度超过二十个字符')]), '只有这一句的完整问题，长度超过二十个字符');
    assert.equal(buildRetrievalQuery([]), '');
    assert.equal(buildRetrievalQuery([assistant('只有助手消息')]), '');
});
