import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
    StdioClientTransport,
    getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { APP_NAME } from '@corpus/core';

export type McpTransportConfig =
    | { type: 'http'; url: string }
    | {
          type: 'stdio';
          command: string;
          args?: string[];
          /** 由 registry 填：插件目录，让 args 里的相对路径能落地 */
          cwd?: string;
          /** 由 registry 填：要透传给插件进程的环境变量（比如 CORPUS_DB） */
          env?: Record<string, string>;
      };

export interface McpServerConfig {
    /** 插件 id，同时用作工具名前缀 */
    id: string;
    name?: string;
    transport: McpTransportConfig;
}

export interface McpTool {
    name: string;
    description?: string;
    /** JSON Schema，原样带回来，交给上层转成 LLM 的 function.parameters */
    inputSchema: unknown;
}

export interface ToolCallResult {
    text: string;
    isError: boolean;
}

/**
 * 连服务器：MDN 的握手实测要 10 秒上下（冷启动），所以给到 15 秒。
 * 别的插件一般亚秒级，这个值只会影响"对方挂了"时的等待。
 */
const CONNECT_TIMEOUT = 15_000;

/** 单次请求：MDN 实测 4 秒，留一倍余量 */
const REQUEST_TIMEOUT = 15_000;

/**
 * 一个 MCP server 的连接。
 * 只用 tools 能力：资源、提示词、采样一律不碰（architecture §7.2）。
 *
 * 超时都在这一层管，registry 不需要关心。
 */
export class McpClient {
    readonly config: McpServerConfig;

    private readonly client: Client;

    private constructor(config: McpServerConfig, client: Client) {
        this.config = config;
        this.client = client;
    }

    static async connect(config: McpServerConfig): Promise<McpClient> {
        const client = new Client({ name: APP_NAME, version: '0.0.0' });

        await client.connect(createTransport(config), { timeout: CONNECT_TIMEOUT });

        return new McpClient(config, client);
    }

    async listTools(): Promise<McpTool[]> {
        const { tools } = await this.client.listTools(undefined, { timeout: REQUEST_TIMEOUT });

        return tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
        }));
    }

    async callTool(
        name: string,
        args: Record<string, unknown>,
        signal?: AbortSignal,
    ): Promise<ToolCallResult> {
        const result = await this.client.callTool({ name, arguments: args }, undefined, {
            timeout: REQUEST_TIMEOUT,
            signal,
        });

        const parts = Array.isArray(result.content) ? result.content : [];
        const text = parts
            .map((part) => (part.type === 'text' ? part.text : JSON.stringify(part)))
            .join('\n');

        return { text, isError: Boolean(result.isError) };
    }

    async close(): Promise<void> {
        await this.client.close();
    }
}

function createTransport(config: McpServerConfig) {
    const { transport } = config;

    if (transport.type === 'http') {
        return new StreamableHTTPClientTransport(new URL(transport.url));
    }

    return new StdioClientTransport({
        command: transport.command,
        args: transport.args,
        cwd: transport.cwd,
        // 默认环境只继承一小部分变量，插件需要的（如 CORPUS_DB）由 registry 显式给出
        env: { ...getDefaultEnvironment(), ...transport.env },
    });
}
