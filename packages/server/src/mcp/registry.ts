import { existsSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DB_PATH } from '../db';
import { resourcesDir } from '../paths';
import {
    deleteCustomServer,
    listCustomServers,
    loadPluginSettings,
    saveCustomServer,
    savePluginEnabled,
} from '../repository';
import { McpClient } from './client';
import type { McpServerConfig, McpTransportConfig, ToolCallResult } from './client';

export interface RegisteredTool {
    /** 对外的唯一名字：mdn__search，避免多个插件撞名 */
    name: string;
    serverId: string;
    /** MCP 那边的原始工具名 */
    toolName: string;
    description?: string;
    inputSchema: unknown;
    /** false = 只给人用，不要出现在给模型的工具清单里 */
    modelVisible: boolean;
}

/** 给前端的插件视图 */
export interface PluginView {
    id: string;
    name: string;
    description?: string;
    /** builtin = 仓库 plugins/ 里的内置插件；custom = 用户自己添加的 */
    source: 'builtin' | 'custom';
    enabled: boolean;
    connected: boolean;
    /** init 还没跑完且没连上：界面显示「连接中」而不是「连接失败」 */
    connecting: boolean;
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
    transport: McpTransportConfig;
}

interface PluginEntry {
    id: string;
    name: string;
    description?: string;
    source: 'builtin' | 'custom';
    /** 这个服务适合什么时候用：会写进系统提示词，帮模型选对服务 */
    modelHint?: string;
    /** 只暴露给模型的工具白名单；不填表示全部暴露 */
    toolAllowlist?: string[];
    modelVisible: boolean;
    /** 配置读不出来时为 null：插件仍然登记，方便列表里展示错误 */
    config: McpServerConfig | null;
    enabled: boolean;
    client: McpClient | null;
    /** 这个插件注册过的工具名，关闭时按它清理 */
    toolNames: string[];
    error?: string;
}

/**
 * 插件目录：开发时是仓库根 plugins/，打包后由 CORPUS_RESOURCES_DIR 指到包内。
 */
const PLUGINS_DIR = join(resourcesDir(), 'plugins');

const SEPARATOR = '__';
const MANIFEST_FILE = 'manifest.json';

class ToolRegistry {
    private readonly plugins = new Map<string, PluginEntry>();
    private readonly tools = new Map<string, RegisteredTool>();
    private initialised = false;
    /** init 是否已经跑完（成功或失败都算）：这之前未连接的插件是「连接中」而不是「失败」 */
    private ready = false;

    /**
     * 扫一遍 plugins 下每个目录的 manifest：
     * 先把所有插件登记进来（不连接），再按数据库里的开关决定连谁。
     *
     * 单个插件失败只记录，不抛——插件系统是可选能力。
     */
    async init(): Promise<void> {
        if (this.initialised) {
            return;
        }
        this.initialised = true;

        try {
            await this.loadPlugins();
        } finally {
            // 串行连接结束（含中途失败）才算 ready。
            // 前端轮询就是在等这个标志变真，否则会把「还没连」显示成「连不上」。
            this.ready = true;
        }
    }

    private async loadPlugins(): Promise<void> {
        let entries: Dirent[] = [];

        try {
            entries = await readdir(PLUGINS_DIR, { withFileTypes: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                console.log('[mcp] 没有 plugins/ 目录，跳过');
                return;
            }
            throw error;
        }

        const settings = loadPluginSettings();

        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }

            if (!existsSync(join(PLUGINS_DIR, entry.name, MANIFEST_FILE))) {
                console.log(`[mcp] ${entry.name} 跳过（没有 ${MANIFEST_FILE}）`);
                continue;
            }

            try {
                const plugin = await readManifest(
                    join(PLUGINS_DIR, entry.name, MANIFEST_FILE),
                    entry.name,
                );

                plugin.enabled = settings.get(plugin.id) ?? true;
                this.plugins.set(plugin.id, plugin);
            } catch (error) {
                const message = describeError(error);
                console.error(`[mcp] ${entry.name} 加载失败：${message}`);

                // 配置坏了也要登记：否则用户只会看到插件凭空消失
                this.plugins.set(entry.name, {
                    id: entry.name,
                    name: entry.name,
                    description: '插件配置读取失败',
                    source: 'builtin',
                    modelVisible: true,
                    config: null,
                    enabled: true,
                    client: null,
                    toolNames: [],
                    error: message,
                });
            }
        }

        // 用户自己添加的 MCP：定义在库里，和内置插件走同一套连接逻辑
        for (const record of listCustomServers()) {
            if (this.plugins.has(record.id)) {
                console.warn(`[mcp] 自定义 MCP ${record.id} 与内置插件重名，跳过`);
                continue;
            }

            try {
                const plugin = this.createEntry(record, 'custom');
                plugin.enabled = settings.get(plugin.id) ?? true;
                this.plugins.set(plugin.id, plugin);
            } catch (error) {
                const message = describeError(error);
                console.error(`[mcp] 自定义 MCP ${record.id} 加载失败：${message}`);
            }
        }

        // 第二阶段才连接：先把所有插件登记好，列表接口立刻能看到全部（未连接的显示为连接中/失败）
        for (const plugin of this.plugins.values()) {
            if (!plugin.enabled) {
                console.log(`[mcp] ${plugin.id} 已关闭，跳过连接`);
                continue;
            }
            await this.connectPlugin(plugin);
        }

        console.log(
            `[mcp] 就绪：${this.plugins.size} 个插件、${this.tools.size} 个工具`,
        );
    }

    /** 把一份 manifest 形状的配置变成内部条目（内置和自定义共用） */
    private createEntry(input: McpManifestInput, source: 'builtin' | 'custom'): PluginEntry {
        const transport = { ...input.transport };

        if (transport.type === 'http') {
            if (!transport.url) {
                throw new Error('http 传输需要填写 url');
            }
        } else if (transport.type === 'stdio') {
            if (!transport.command) {
                throw new Error('stdio 传输需要填写 command');
            }
            transport.cwd ??= process.cwd();
            transport.env = { ...transport.env, CORPUS_DB: DB_PATH };
        } else {
            throw new Error('不支持的传输类型');
        }

        return {
            id: input.id,
            name: input.name ?? input.id,
            description: input.description,
            modelHint: input.modelHint,
            toolAllowlist: input.tools,
            source,
            modelVisible: true,
            config: { id: input.id, name: input.name, transport },
            enabled: true,
            client: null,
            toolNames: [],
        };
    }

    /** 测试待添加的 MCP：连上、列工具、断开。不改注册表也不落库 */
    async testCustom(
        input: McpManifestInput,
    ): Promise<{ toolCount: number; tools: { name: string; description?: string }[] }> {
        const entry = this.createEntry(input, 'custom');
        if (!entry.config) {
            throw new Error('配置无效');
        }

        const client = await McpClient.connect(entry.config);

        try {
            const allTools = await client.listTools();
            const tools = entry.toolAllowlist
                ? allTools.filter((tool) => entry.toolAllowlist?.includes(tool.name))
                : allTools;

            return {
                toolCount: tools.length,
                tools: tools.map((tool) => ({ name: tool.name, description: tool.description })),
            };
        } finally {
            await client.close().catch(() => {});
        }
    }

    /** 添加自定义 MCP：先落库，再注册并连接 */
    async addCustom(input: McpManifestInput): Promise<PluginView> {
        if (!input.id?.trim()) {
            throw new Error('缺少 id');
        }

        if (this.plugins.has(input.id)) {
            throw new Error(`id 已存在：${input.id}`);
        }

        const entry = this.createEntry(input, 'custom');

        saveCustomServer({
            id: entry.id,
            name: entry.name,
            description: entry.description,
            modelHint: entry.modelHint,
            tools: entry.toolAllowlist,
            // 存用户填的原始配置，不要存 createEntry 补进去的 cwd / CORPUS_DB：
            // 那些是运行期注入的，换台机器或换目录就过期了
            transport: input.transport,
        });

        this.plugins.set(entry.id, entry);
        await this.connectPlugin(entry);

        return this.toView(entry);
    }

    /** 删除自定义 MCP；内置插件不允许删 */
    async removeCustom(id: string): Promise<void> {
        const plugin = this.plugins.get(id);
        if (!plugin) {
            throw new Error(`未知插件：${id}`);
        }
        if (plugin.source !== 'custom') {
            throw new Error('内置插件不能删除');
        }

        await this.disconnectPlugin(plugin);
        this.plugins.delete(id);
        deleteCustomServer(id);
    }

    /** 连上并注册工具；失败记在插件上，不抛 */
    private async connectPlugin(plugin: PluginEntry): Promise<void> {
        if (!plugin.config) {
            plugin.error = '插件配置无效，无法连接';
            return;
        }

        const startedAt = Date.now();
        console.log(`[mcp] ${plugin.id} 连接中…`);

        try {
            const client = await McpClient.connect(plugin.config);
            const allTools = await client.listTools();

            // 白名单：清单里没列的工具不注册，模型也就看不到
            const tools = plugin.toolAllowlist
                ? allTools.filter((tool) => plugin.toolAllowlist?.includes(tool.name))
                : allTools;

            plugin.client = client;
            plugin.toolNames = [];

            for (const tool of tools) {
                const name = `${plugin.id}${SEPARATOR}${tool.name}`;
                plugin.toolNames.push(name);
                this.tools.set(name, {
                    name,
                    serverId: plugin.id,
                    toolName: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                    modelVisible: plugin.modelVisible,
                });
            }

            plugin.error = undefined;
            console.log(
                `[mcp] ${plugin.id} ✓ ${tools.length} 个工具（${Date.now() - startedAt}ms）`,
            );
        } catch (error) {
            const message = describeError(error);
            plugin.client = null;
            plugin.toolNames = [];
            plugin.error = message;
            console.error(`[mcp] ${plugin.id} ✗ ${message}（${Date.now() - startedAt}ms）`);
        }
    }

    /** 断开并撤掉工具：模型和调试接口都不该再看到它 */
    private async disconnectPlugin(plugin: PluginEntry): Promise<void> {
        for (const name of plugin.toolNames) {
            this.tools.delete(name);
        }
        plugin.toolNames = [];

        if (plugin.client) {
            await plugin.client.close().catch(() => {});
            plugin.client = null;
        }

        plugin.error = undefined;
        console.log(`[mcp] ${plugin.id} 已关闭`);
    }

    /** 开关插件：落库 + 立即生效（连上或断开） */
    async setEnabled(id: string, enabled: boolean): Promise<PluginView> {
        const plugin = this.plugins.get(id);
        if (!plugin) {
            throw new Error(`未知插件：${id}`);
        }

        if (plugin.enabled === enabled) {
            return this.toView(plugin);
        }

        plugin.enabled = enabled;
        savePluginEnabled(id, enabled);

        if (enabled) {
            await this.connectPlugin(plugin);
        } else {
            await this.disconnectPlugin(plugin);
        }

        return this.toView(plugin);
    }

    /** 插件列表（给设置界面） */
    describe(): PluginView[] {
        return [...this.plugins.values()].map((plugin) => this.toView(plugin));
    }

    has(id: string): boolean {
        return this.plugins.has(id);
    }

    private toView(plugin: PluginEntry): PluginView {
        return {
            id: plugin.id,
            name: plugin.name,
            description: plugin.description,
            source: plugin.source,
            enabled: plugin.enabled,
            connected: plugin.client !== null,
            // 只有「init 没跑完、已启用、还没连上、也没报错」才是连接中；
            // 连过但失败（error 有值）必须显示失败，不能被连接中盖住
            connecting: !this.ready && plugin.enabled && plugin.client === null && !plugin.error,
            toolCount: plugin.toolNames.length,
            error: plugin.error,
        };
    }

    list(): RegisteredTool[] {
        return [...this.tools.values()];
    }

    /** 给模型的工具清单：过滤掉 modelVisible: false 的 */
    listModelVisible(): RegisteredTool[] {
        return this.list().filter((tool) => tool.modelVisible);
    }

    /** 已连接且有方向说明的插件：拼进系统提示词，帮模型选对服务 */
    hints(): { name: string; hint: string }[] {
        return [...this.plugins.values()]
            .filter((plugin) => plugin.enabled && plugin.client !== null && plugin.modelHint)
            .map((plugin) => ({ name: plugin.name, hint: plugin.modelHint ?? '' }));
    }

    /** 加载失败的插件，给调试接口用 */
    failures(): { pluginId: string; error: string }[] {
        return this.describe()
            .filter((plugin) => plugin.enabled && !plugin.connected && plugin.error)
            .map((plugin) => ({ pluginId: plugin.id, error: plugin.error ?? '' }));
    }

    async call(
        name: string,
        args: Record<string, unknown>,
        signal?: AbortSignal,
    ): Promise<ToolCallResult> {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new Error(`未知工具：${name}`);
        }

        const plugin = this.plugins.get(tool.serverId);
        if (!plugin?.client) {
            throw new Error(`插件未连接：${tool.serverId}`);
        }

        return plugin.client.callTool(tool.toolName, args, signal);
    }
}

/**
 * 读并校验 manifest。
 * 不做错误兜底：缺文件、JSON 写错、字段缺失都直接抛，由 init 记日志。
 *
 * stdio 插件在这里补两样东西：cwd（让 args 里的相对路径可解析）和 CORPUS_DB。
 */
async function readManifest(path: string, dir: string): Promise<PluginEntry> {
    const raw = await readFile(path, 'utf8');
    const manifest = JSON.parse(raw) as {
        id?: string;
        name?: string;
        description?: string;
        modelHint?: string;
        tools?: string[];
        modelVisible?: boolean;
        transport?: McpTransportConfig;
    };

    if (!manifest.id) {
        throw new Error(`${MANIFEST_FILE} 缺少 id`);
    }

    const transport = manifest.transport;
    if (!transport) {
        throw new Error(`${MANIFEST_FILE} 缺少 transport`);
    }

    if (transport.type === 'http') {
        if (!transport.url) {
            throw new Error('http transport 缺少 url');
        }
    } else if (transport.type === 'stdio') {
        if (!transport.command) {
            throw new Error('stdio transport 缺少 command');
        }
        transport.cwd = join(PLUGINS_DIR, dir);
        transport.env = { ...transport.env, CORPUS_DB: DB_PATH };
    } else {
        throw new Error(`不支持的 transport 类型：${String((transport as { type?: string }).type)}`);
    }

    return {
        id: manifest.id,
        name: manifest.name ?? manifest.id,
        description: manifest.description,
        modelHint: manifest.modelHint,
        toolAllowlist: manifest.tools,
        source: 'builtin',
        modelVisible: manifest.modelVisible ?? true,
        config: { id: manifest.id, name: manifest.name, transport },
        enabled: true,
        client: null,
        toolNames: [],
    };
}

/**
 * fetch 抛出来的错误只写着 "fetch failed"，真正原因在 cause 里
 * （DNS 解析不了、连接被拒、TLS 失败…）。列表里要给人看的是后者。
 */
function describeError(error: unknown): string {
    if (!(error instanceof Error)) {
        return String(error);
    }

    const cause = error.cause;
    if (cause instanceof Error && cause.message && cause.message !== error.message) {
        return `${error.message}: ${cause.message}`;
    }

    return error.message;
}

export const toolRegistry = new ToolRegistry();
