import express from 'express';
import { healthzApi, chatReadyzApi, chatApi, conversationApi } from './api';

/**
 * 建 app 但不 listen，方便测试和评测脚本直接拿 app 用。
 * 配置校验不在这里做——调用方先 initLLMConfig 再 createApp。
 *
 * 所有接口统一挂在 /api 下：前端只需要一条代理规则，新增接口不用再改 vite.config。
 */
export function createApp() {
    const app = express();
    app.use(express.json());

    app.use('/api/healthz', healthzApi);
    app.use('/api/chat-readyz', chatReadyzApi);
    app.use('/api/chat', chatApi);
    app.use('/api/conversation', conversationApi);

    return app;
}
