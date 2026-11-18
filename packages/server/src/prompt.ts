import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Citation } from '@corpus/core/types';

import { resourcesDir } from './paths';

interface ServiceHint {
    name: string;
    hint: string;
}

export interface PromptContext {
    /** 各 MCP 插件在 manifest 里写的「什么时候用我」 */
    hints?: ServiceHint[];
    /** 本地文档检索出来的片段，按 [1] [2] 编号注入 */
    references?: Citation[];
    /** 历史被截断过：要告诉模型更早的对话看不到 */
    historyTrimmed?: boolean;
}

/**
 * 提示词放在仓库根 prompts/ 下，改文案不用动代码。
 * 和 plugins 一样是相对源码路径算的，M11 打包时一起搬进 resources。
 */
const PROMPT_PATH = join(resourcesDir(), 'prompts', 'chat-system.md');

let cachedBase: string | null = null;

function basePrompt(): string {
    if (cachedBase !== null) {
        return cachedBase;
    }

    try {
        cachedBase = readFileSync(PROMPT_PATH, 'utf8').trim();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[prompt] 读取系统提示词失败（${PROMPT_PATH}）：${message}`);
        cachedBase = '';
    }

    return cachedBase;
}

/**
 * 基础提示词 + 插件方向说明 + 本轮检索到的参考资料。
 *
 * 参考资料放 system 而不是 user：模型更倾向把它当「给定资料」，
 * 而不是「用户说的另一段话」，被文中内容带跑的概率更低。
 */
export function buildSystemPrompt(context: PromptContext = {}): string {
    const sections = [basePrompt()];

    const hints = context.hints ?? [];
    if (hints.length > 0) {
        const lines = hints.map(({ name, hint }) => `- **${name}**：${hint}`);
        sections.push(['## 可用的文档服务', ...lines].join('\n'));
    }

    const references = context.references ?? [];
    if (references.length > 0) {
        const lines = references.map((citation, index) => {
            // 注入完整原文；没有完整内容时退回摘要
            const body = (citation.content ?? citation.excerpt ?? '')
                .replace(/\n{3,}/g, '\n\n')
                .slice(0, 3000);

            return `[${index + 1}] ${citation.title}（${citation.locator}）\n${body}`;
        });

        sections.push(['## 参考资料', ...lines].join('\n\n'));
    }

    if (context.historyTrimmed) {
        sections.push(
            [
                '## 对话历史',
                '更早的对话已经省略。如果用户提到「上面说过的」「刚才那个」，而你找不到对应内容，',
                '直接说明看不到更早的内容，不要猜。',
            ].join('\n'),
        );
    }

    return sections.filter(Boolean).join('\n\n');
}
