import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Message } from '@corpus/core/types';

import { trimHistory } from './context';
import { resourcesDir } from './paths';

/** 交接摘要可以比普通历史多给一些，但仍然要限住 */
const HANDOFF_MAX_TOKENS = 24_000;

const PROMPT_PATH = join(resourcesDir(), 'prompts', 'handoff.md');

let cachedPrompt: string | null = null;

function handoffPrompt(): string {
    if (cachedPrompt !== null) {
        return cachedPrompt;
    }

    try {
        cachedPrompt = readFileSync(PROMPT_PATH, 'utf8').trim();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[handoff] 读取交接提示词失败（${PROMPT_PATH}）：${message}`);
        cachedPrompt = '把下面的对话压缩成一份交接摘要，包含目标、已确认、未决、下一步。';
    }

    return cachedPrompt;
}

/**
 * 组装交接摘要的请求消息。
 *
 * 对话用「用户：/助手：」的纯文本形式给模型，比塞成多轮消息更省 token，
 * 也能避免模型把历史回答当成需要继续的任务。
 */
export function buildHandoffMessages(history: Message[]): Message[] {
    const trimmed = trimHistory(history, HANDOFF_MAX_TOKENS);

    const transcript = trimmed.messages
        .map((message) => `${message.role === 'user' ? '用户' : '助手'}：${message.content}`)
        .join('\n\n');

    return [
        { role: 'system', content: handoffPrompt() },
        { role: 'user', content: `以下是需要交接的对话记录：\n\n${transcript}` },
    ];
}
