import type { Conversation } from '@corpus/core/types';

export interface ConversationGroup {
    label: string;
    items: Conversation[];
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * 按「今天 / 昨天 / 更早」分组，纯函数，不碰时间以外的任何状态。
 */
export function groupConversationsByDay(
    conversations: Conversation[],
    now: number = Date.now(),
): ConversationGroup[] {
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const today: Conversation[] = [];
    const yesterday: Conversation[] = [];
    const earlier: Conversation[] = [];

    for (const conversation of conversations) {
        if (conversation.updatedAt >= startOfToday) {
            today.push(conversation);
        } else if (conversation.updatedAt >= startOfToday - DAY) {
            yesterday.push(conversation);
        } else {
            earlier.push(conversation);
        }
    }

    return [
        { label: '今天', items: today },
        { label: '昨天', items: yesterday },
        { label: '更早', items: earlier },
    ].filter((group) => group.items.length > 0);
}
