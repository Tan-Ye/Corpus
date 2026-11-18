import { writeFileSync } from 'node:fs';
import type { Server } from 'node:http';

import { createApp } from './app';
import env from './env';
import { assertDatabaseWritable, DB_PATH, runMigrations } from './db';
import { loadLLMConfig } from './llm-config';
import { toolRegistry } from './mcp';

/** 把启动期的异常翻成用户能照着做的一句话，而不是一闪而过的堆栈 */
function describe(error: unknown): string {
    const code = (error as NodeJS.ErrnoException | null)?.code;

    if (code === 'EACCES' || code === 'EPERM') {
        return '没有权限读写数据目录：检查 %APPDATA%\\Corpus 是否存在且可写';
    }

    return error instanceof Error ? error.message : String(error);
}

/**
 * 固定端口监听，不再自动往后找。
 *
 * 便携版启动器会在拉起 server 之前把旧实例清掉，所以这里遇到占用就是真问题：
 * 悄悄换端口会让书签和开发环境的 proxy 指向错的地方，报清楚更好排查。
 */
async function listenOnce(
    app: ReturnType<typeof createApp>,
    port: number,
): Promise<Server> {
    return new Promise<Server>((resolve, reject) => {
        const server = app.listen(port, '127.0.0.1');

        server.once('listening', () => resolve(server));
        server.once('error', (error) => {
            server.close();

            if ((error as NodeJS.ErrnoException | null)?.code !== 'EADDRINUSE') {
                reject(error);
                return;
            }

            reject(
                new Error(
                    `端口 ${port} 被占用。便携版启动器启动时会自动清理旧实例；` +
                        '开发模式请先关闭占用它的进程（或改 .env 里的 PORT）。',
                ),
            );
        });
    });
}

/** 实际端口写进文件：launcher 靠它开浏览器，避免两边各自猜 */
function writePortFile(port: number): void {
    const file = process.env.CORPUS_PORT_FILE?.trim();

    if (!file) {
        return;
    }

    try {
        writeFileSync(file, String(port), 'utf8');
    } catch (error) {
        console.warn('[startup] 写端口文件失败:', describe(error));
    }
}

async function main() {
    // 先把库的位置打出来：开发版和便携版曾经共用一个库，冲突时看不出连的是谁
    console.log(`[startup] 数据库：${DB_PATH}`);

    // 先确认数据库能写：被别的实例占着时，这里就停下并说清原因，
    // 而不是等用户上传文档或保存配置时才吐一条英文的 readonly 错误
    assertDatabaseWritable();

    await runMigrations();

    // 模型配置：界面里填的优先，其次开发环境的 .env。
    // 都没有也让服务起来——用户得先能打开界面，才谈得上填模型。
    const llm = loadLLMConfig();

    if (llm.configured) {
        console.log(
            `[startup] 模型：${llm.model}（来源：${llm.source === 'env' ? '.env' : '用户配置'}）`,
        );
    } else {
        console.warn(
            '[startup] 还没有配置模型：聊天会被拒绝，请在界面「设置」里填写服务地址、模型名和 API Key',
        );
    }

    const app = createApp();

    // 只服务本机，不绑 127.0.0.1 等于对局域网开放
    const server = await listenOnce(app, env.PORT);

    console.log(`Corpus server → http://127.0.0.1:${env.PORT}（模型：${llm.model || '未配置'}）`);
    writePortFile(env.PORT);

    // 插件最后加载：先把服务让出来。
    // 连接慢或失败都不影响主流程，失败原因会出现在插件列表里。
    void toolRegistry.init().catch((error: unknown) => {
        console.error('[mcp] 插件系统启动失败:', describe(error));
    });

    // 启动之后的运行期错误（比如句柄失效），只记录，不假装服务还在
    server.on('error', (error) => {
        console.error(`[startup] 服务异常：${describe(error)}`);
    });
}

main().catch((error: unknown) => {
    console.error(`[startup] 启动失败：${describe(error)}`);
    process.exitCode = 1;
});
