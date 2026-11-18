import type { Message } from '@corpus/core/types';

/** 明显指代上一轮的词，出现就说明这一句离不开上下文 */
const FOLLOW_UP_PREFIX = /^(它|他|她|这个|那个|这些|那些|上面|刚才|前面|那|这)/;

/** 很短的句子多半是追问：「第二点呢」「为什么」；阈值定太高会把正常短问题也并进来 */
const SHORT_QUESTION_LENGTH = 10;

/**
 * 拼检索用的 query。
 *
 * 检索只用最后一句时，追问会失配：问「那它的第二点呢」，
 * 单看这句话什么关键词都没有。所以判断是追问时，把上一轮提问也带上。
 *
 * 这里刻意用启发式而不是让模型改写：少一次请求、结果可预测、单测好写。
 * 以后要更准，可以换成 LLM 改写，接口保持不变。
 */
export function buildRetrievalQuery(messages: Message[]): string {
    const userMessages = messages
        .filter((message) => message.role === 'user')
        .map((message) => message.content.trim())
        .filter(Boolean);

    const last = userMessages.at(-1) ?? '';

    if (!last) {
        return '';
    }

    const previous = userMessages.at(-2) ?? '';
    const isFollowUp = last.length <= SHORT_QUESTION_LENGTH || FOLLOW_UP_PREFIX.test(last);

    return previous && isFollowUp ? `${previous}\n${last}` : last;
}
