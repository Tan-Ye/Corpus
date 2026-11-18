import type { Message } from '@corpus/core/types';

/** 中日韩统一表意文字：这些字大致 1 字 1 token */
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/g;

/** 每条消息的固定开销（role、分隔符等） */
const MESSAGE_OVERHEAD_TOKENS = 4;

/**
 * 历史预算（token）。
 *
 * 模型上下文 128k，但没必要把历史堆满：
 * 系统提示词（含参考资料）、本轮回答、重试余量都要留出空间。
 */
export const MAX_HISTORY_TOKENS = 12_000;

/** 模型上下文上限：用环境变量覆盖，默认按 128k 算 */
export const MODEL_CONTEXT_TOKENS = Number(process.env.CORPUS_CONTEXT_TOKENS ?? 128_000);

/**
 * 粗略估算 token 数，不引 tokenizer。
 *
 * 中文按 1 字 1 token，其余按 4 字符 1 token——对中文基本准，对英文偏保守。
 * 估算偏高是安全的：宁可早一点截断，也不要请求到一半被上游拒掉。
 */
export function estimateTokens(text: string): number {
    const cjkCount = (text.match(CJK) ?? []).length;
    const otherCount = text.length - cjkCount;

    return Math.ceil(cjkCount + otherCount / 4);
}

export interface TrimResult {
    messages: Message[];
    /** 是否发生过截断 */
    trimmed: boolean;
    /** 被丢掉的消息条数 */
    droppedMessages: number;
    /** 保留部分的估算 token */
    estimatedTokens: number;
}

/**
 * 只保留最近的一段对话，避免长会话把上下文撑爆。
 *
 * 按「轮」切（一条 user 到下一个 user 之前算一轮），不按单条消息切：
 * 否则可能出现「有回答没有提问」或者反过来。
 *
 * 规则：
 * - 从最新往前收，超出预算就停
 * - 至少保留最后一轮（否则这一轮没法问）
 */
export function trimHistory(
    messages: Message[],
    maxTokens: number = MAX_HISTORY_TOKENS,
): TrimResult {
    if (messages.length === 0) {
        return { messages: [], trimmed: false, droppedMessages: 0, estimatedTokens: 0 };
    }

    const turns = groupIntoTurns(messages);
    const kept: Message[][] = [];
    let tokens = 0;

    for (let index = turns.length - 1; index >= 0; index -= 1) {
        const turn = turns[index] ?? [];
        const turnTokens = countTokens(turn);

        // 至少保留最后一轮：单轮就超预算时也要让它过去
        if (kept.length > 0 && tokens + turnTokens > maxTokens) {
            break;
        }

        tokens += turnTokens;
        kept.unshift(turn);
    }

    const result = kept.flat();

    return {
        messages: result,
        trimmed: result.length < messages.length,
        droppedMessages: messages.length - result.length,
        estimatedTokens: tokens,
    };
}

function countTokens(messages: Message[]): number {
    return messages.reduce(
        (sum, message) => sum + estimateTokens(message.content) + MESSAGE_OVERHEAD_TOKENS,
        0,
    );
}

function groupIntoTurns(messages: Message[]): Message[][] {
    const turns: Message[][] = [];
    let current: Message[] = [];

    for (const message of messages) {
        if (message.role === 'user' && current.length > 0) {
            turns.push(current);
            current = [];
        }

        current.push(message);
    }

    if (current.length > 0) {
        turns.push(current);
    }

    return turns;
}
