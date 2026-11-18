import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Message } from '@corpus/core/types';

import { buildHandoffMessages } from './handoff';

function user(content: string): Message {
    return { role: 'user', content };
}

function assistant(content: string): Message {
    return { role: 'assistant', content };
}

test('交接请求：系统提示 + 带角色前缀的对话记录', () => {
    const messages = buildHandoffMessages([user('问题一'), assistant('回答一')]);

    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.role, 'system');
    assert.match(messages[0]?.content ?? '', /交接摘要/);

    const payload = messages[1]?.content ?? '';
    assert.match(payload, /用户：问题一/);
    assert.match(payload, /助手：回答一/);
});

test('交接请求：超长会话会截断，但保留最后几轮', () => {
    const history: Message[] = [];

    for (let index = 0; index < 60; index += 1) {
        history.push(user(`第 ${index} 轮问题：${'细节'.repeat(300)}`));
        history.push(assistant(`第 ${index} 轮回答：${'结论'.repeat(300)}`));
    }

    const messages = buildHandoffMessages(history);
    const payload = messages[1]?.content ?? '';

    assert.match(payload, /第 59 轮问题/, '最后几轮要在');
    assert.ok(!payload.includes('第 0 轮问题'), '最前面的轮次应该被截掉');
});
