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

/** 默认开启；关掉的记在 localStorage 里 */
export function getBuiltinFeatures(): PluginView[] {
    const stored = readStored();

    return BUILTIN_FEATURES.map((feature) => {
        const enabled = stored[feature.id] ?? true;
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
