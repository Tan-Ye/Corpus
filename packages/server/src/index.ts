import { initLLMConfig } from '@corpus/core';
import { createApp } from './app';
import env from './env';
import { runMigrations } from './db';
import { toolRegistry } from './mcp';

await runMigrations();

// 启动前就校验配置：缺变量立刻失败，而不是等第一个请求
initLLMConfig({
    baseUrl: env.LLM_BASE_URL,
    model: env.LLM_MODEL,
    apiKey: env.LLM_API_KEY,
});

const app = createApp();

// 只服务本机，不绑 127.0.0.1 等于对局域网开放
app.listen(env.PORT, '127.0.0.1', () => {
    console.log(`Corpus server → http://127.0.0.1:${env.PORT}（模型：${env.LLM_MODEL}）`);

    // 插件最后加载：先把服务让出来。
    // 连接慢或失败都不影响主流程，失败原因会出现在插件列表里。
    void toolRegistry.init().catch((error: unknown) => {
        console.error('[mcp] 插件系统启动失败:', error instanceof Error ? error.message : error);
    });
});
