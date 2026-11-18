import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Message } from '@corpus/core/types';

import { estimateTokens, trimHistory } from './context';

function user(content: string): Message {
    return { role: 'user', content };
}

function assistant(content: string): Message {
    return { role: 'assistant', content };
}

test('token 估算：中文按字，英文按 4 字符', () => {
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens('民法典'), 3);
    assert.equal(estimateTokens('abcd'), 1);
    assert.ok(estimateTokens('中文 mixed 英文') > 2);
});

test('预算足够：全部保留，不标记截断', () => {
    const messages = [user('问题一'), assistant('回答一'), user('问题二')];

    const result = trimHistory(messages, 1000);

    assert.equal(result.trimmed, false);
    assert.equal(result.droppedMessages, 0);
    assert.deepEqual(result.messages, messages);
    assert.ok(result.estimatedTokens > 0);
});

test('按轮截断：不会切出「有回答没提问」的半轮', () => {
    const messages = [
        user('第一轮问题，内容比较长一些'),
        assistant('第一轮回答，内容也比较长一些'),
        user('第二轮问题'),
        assistant('第二轮回答'),
    ];

    // 预算只够一轮（每轮约 4+8=12 token，这里只给 20）
    const result = trimHistory(messages, 20);

    assert.equal(result.trimmed, true);
    assert.equal(result.messages[0]?.role, 'user', '必须从提问开始');
    assert.deepEqual(result.messages, [user('第二轮问题'), assistant('第二轮回答')]);
    assert.equal(result.droppedMessages, 2);
});

test('至少保留最后一轮：单轮超预算也不丢', () => {
    const huge = '很长的历史内容。'.repeat(1000);
    const messages = [user('之前的问题'), assistant(huge), user('这一轮问题')];

    const result = trimHistory(messages, 10);

    assert.equal(result.messages.at(-1)?.content, '这一轮问题');
    assert.equal(result.messages[0]?.role, 'user');
});

test('空数组返回空', () => {
    assert.deepEqual(trimHistory([]), {
        messages: [],
        trimmed: false,
        droppedMessages: 0,
        estimatedTokens: 0,
    });
});
