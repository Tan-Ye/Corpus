import { initLLMConfig } from '@corpus/core';
import { createApp } from './app';
import env from './env';

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
});
