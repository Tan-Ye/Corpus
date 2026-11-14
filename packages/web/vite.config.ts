import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            // 必须是绝对路径；相对字符串会被当成引用方目录下的路径
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    server: {
        port: 5173,
        // 后端所有接口都在 /api 下，一条代理搞定；新增接口不用再改这里
        proxy: {
            '/api': 'http://127.0.0.1:8787',
        },
    },
});
