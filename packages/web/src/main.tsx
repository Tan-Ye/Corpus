import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@/index.css'
import { readStoredTheme, applyTheme } from '@/hooks'
import { ChatPage } from '@/pages/chat'

// 首屏之前先把主题落到 <html> 上，避免先白一下再变深色
applyTheme(readStoredTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChatPage />
  </StrictMode>,
)
