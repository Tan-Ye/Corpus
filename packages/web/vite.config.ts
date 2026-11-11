import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
    // 前端 5173，API 8787；走代理就不用管 CORS
    proxy: {
      '/chat': 'http://127.0.0.1:8787',
      '/health': 'http://127.0.0.1:8787',
      '/healthz': 'http://127.0.0.1:8787',
      '/chat-readyz': 'http://127.0.0.1:8787',
    },
  },
})
