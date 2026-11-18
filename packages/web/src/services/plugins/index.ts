import { del, get, post } from '@/utils/request';

/** mcp = 服务端插件；builtin = 前端自己带的额外功能（不经过服务端开关） */
export type PluginKind = 'mcp' | 'builtin';

export interface PluginView {
    id: string;
    name: string;
    description?: string;
    /** builtin = 仓库内置插件；custom = 用户自己添加的 MCP */
    source: 'builtin' | 'custom';
    /** 内置功能（数据库、日志、MCP 管理）由前端补上这个字段 */
    kind?: PluginKind;
    enabled: boolean;
    connected: boolean;
    /** 服务端还在连（启动时串行连接外接 MCP）：界面显示「连接中」而不是「失败」 */
    connecting?: boolean;
    toolCount: number;
    error?: string;
}

/** 用户填写的 MCP 定义，形状和 manifest.json 一致 */
export interface McpManifestInput {
    id: string;
    name?: string;
    description?: string;
    modelHint?: string;
    tools?: string[];
    transport:
        | { type: 'http'; url: string }
        | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> };
}

export interface McpTestResult {
    toolCount: number;
    tools: { name: string; description?: string }[];
}

export function listPlugins(): Promise<PluginView[]> {
    return get<PluginView[]>('/plugins');
}

/** MCP 插件的开关交给服务端：它负责真去连接 / 断开 */
export function setPluginEnabled(id: string, enabled: boolean): Promise<PluginView> {
    return post<PluginView>(`/plugins/${id}/enabled`, { enabled });
}

/** 试连一个待添加的 MCP，不落库 */
export function testMcp(manifest: McpManifestInput): Promise<McpTestResult> {
    return post<McpTestResult>('/plugins/test', manifest);
}

export function addCustomMcp(manifest: McpManifestInput): Promise<PluginView> {
    return post<PluginView>('/plugins/custom', manifest);
}

export function removeCustomMcp(id: string): Promise<void> {
    return del<void>(`/plugins/custom/${id}`);
}
