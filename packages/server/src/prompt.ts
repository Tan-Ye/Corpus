import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface ServiceHint {
    name: string;
    hint: string;
}

/**
 * 提示词放在仓库根 prompts/ 下，改文案不用动代码。
 * 和 plugins 一样是相对源码路径算的，M11 打包时一起搬进 resources。
 */
const PROMPT_PATH = fileURLToPath(new URL('../../../prompts/chat-system.md', import.meta.url));

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
 * 基础提示词 + 每个插件在 manifest 里写的「什么时候用我」。
 *
 * 工具的方向说明跟着插件走，不在代码里维护：
 * 新增一个 MCP 服务 = 加一个 manifest，不用改这里。
 */
export function buildSystemPrompt(hints: ServiceHint[]): string {
    const sections = [basePrompt()];

    if (hints.length > 0) {
        const lines = hints.map(({ name, hint }) => `- **${name}**：${hint}`);
        sections.push(['## 可用的文档服务', ...lines].join('\n'));
    }

    return sections.filter(Boolean).join('\n\n');
}
