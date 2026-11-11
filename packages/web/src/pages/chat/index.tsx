import { useState } from 'react'

import { AppSidebar } from '@/components/chat/app-sidebar'
import { ChatComposer } from '@/components/chat/chat-composer'
import { ChatHeader } from '@/components/chat/chat-header'
import { MessageList } from '@/components/chat/message-list'
import { SourcePanel } from '@/components/chat/source-panel'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useTheme } from '@/hooks'

import { DEMO_CONVERSATIONS, DEMO_MESSAGES, SUGGESTIONS } from './demo-data'

export function ChatPage() {
  const [conversations] = useState(DEMO_CONVERSATIONS)
  const [activeId, setActiveId] = useState(DEMO_CONVERSATIONS[0]?.id ?? '')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [input, setInput] = useState('')
  const { theme, toggleTheme } = useTheme()

  const activeConversation = conversations.find((item) => item.id === activeId)
  const messages = activeConversation ? DEMO_MESSAGES : []
  const citations =
    messages.findLast((message) => (message.citations?.length ?? 0) > 0)?.citations ?? []

  function handleNew() {
    setActiveId('')
    setInput('')
    setSidebarOpen(false)
  }

  function handleSelect(id: string) {
    setActiveId(id)
    setSidebarOpen(false)
  }

  // 发送逻辑等接上 /chat 再填
  function handleSubmit() {
    return undefined
  }

  const sidebar = (
    <AppSidebar
      conversations={conversations}
      activeId={activeId}
      onSelect={handleSelect}
      onNew={handleNew}
    />
  )

  return (
    <TooltipProvider delay={200}>
      <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
        {/* 桌面端固定侧栏；移动端收进抽屉 */}
        <div className="hidden md:flex">{sidebar}</div>

        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-64 p-0" showCloseButton={false}>
            <SheetTitle className="sr-only">会话列表</SheetTitle>
            {sidebar}
          </SheetContent>
        </Sheet>

        <main className="flex min-w-0 flex-1 flex-col">
          <ChatHeader
            title={activeConversation?.title ?? '新对话'}
            model="deepseek-chat"
            theme={theme}
            onToggleTheme={toggleTheme}
            onOpenSidebar={() => setSidebarOpen(true)}
          />

          <MessageList messages={messages} suggestions={SUGGESTIONS} onPickSuggestion={setInput} />

          <ChatComposer value={input} onChange={setInput} onSubmit={handleSubmit} />
        </main>

        {/* 出处常驻：宽屏显示，窄屏退回消息下方的一行链接 */}
        <SourcePanel citations={citations} />
      </div>
    </TooltipProvider>
  )
}
