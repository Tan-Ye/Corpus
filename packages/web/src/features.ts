import type { PluginView } from '@/services/plugins';

/**
 * 内置的额外功能：不需要服务端，开关也只影响前端。
 *
 * 和服务端 MCP 插件的区别只有一点——它们的开关状态存在浏览器里，
 * 因为「显不显示入口」这件事服务端根本不需要知道。
 */
export interface BuiltinFeature {
    id: string;
    name: string;
    description: string;
}

const BUILTIN_FEATURES: BuiltinFeature[] = [
    {
        id: 'db-explorer',
        name: '数据库浏览器',
        description: '只读查看 corpus.db 的表清单，执行 SELECT 并按 50 行分页',
    },
    {
        id: 'logs',
        name: '日志',
        description: '查看工具调用、LLM 轮次和错误记录，可按时间范围清理',
    },
    {
        id: 'mcp-manager',
        name: '额外 MCP',
        description: '添加、开关和删除自己接入的 MCP 服务（内置插件在 plugins/ 目录）',
    },
    {
        id: 'documents',
        name: '文档库',
        description: '上传 Markdown / 文本 / Word / PDF，解析入库并检索',
    },
    {
        id: 'retrieval',
        name: '文档检索',
        description: '对话时先检索文档库，把命中片段作为参考资料交给模型',
    },
];

const STORAGE_KEY = 'corpus:features';

function readStored(): Record<string, boolean> {
    try {
        return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<
            string,
            boolean
        >;
    } catch {
        return {};
    }
}

/**
 * 哪些内置功能默认开。
 *
 * 文档库和文档检索是主流程的一部分（上传资料 → 提问时带引用），默认关掉等于
 * 让「引用 + 拒答」这两条承诺默认不生效；数据库、日志、MCP 属于额外工具，
 * 仍然默认关，避免一进来就被一堆入口淹没。
 */
function defaultEnabled(id: string): boolean {
    return id === 'documents' || id === 'retrieval';
}

/** 默认值见 defaultEnabled；用户手动关过的以 localStorage 为准 */
export function getBuiltinFeatures(): PluginView[] {
    const stored = readStored();

    return BUILTIN_FEATURES.map((feature) => {
        const enabled = stored[feature.id] ?? defaultEnabled(feature.id);
        return {
            ...feature,
            kind: 'builtin' as const,
            source: 'builtin' as const,
            enabled,
            connected: enabled,
            toolCount: 0,
        };
    });
}

export function setBuiltinFeatureEnabled(id: string, enabled: boolean): PluginView[] {
    const stored = { ...readStored(), [id]: enabled };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    return getBuiltinFeatures();
}

/** 某个内置功能是否开启（比如侧栏入口显不显示） */
export function isBuiltinFeatureEnabled(features: PluginView[], id: string): boolean {
    return features.find((feature) => feature.id === id)?.enabled ?? false;
}
