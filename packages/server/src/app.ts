import express from 'express';
import { healthzApi, chatReadyzApi } from './api';

/**
 * 建 app 但不 listen，方便测试和评测脚本直接拿 app 用。
 * 配置校验不在这里做——调用方先 initLLMConfig 再 createApp。
 */
export function createApp() {
    const app = express();

    app.use('/healthz', healthzApi.router);
    app.use('/chat-readyz', chatReadyzApi.router);

    return app;
}
