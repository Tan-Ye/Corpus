import { useEffect, useState } from 'react';

import type { ChatMessage, Conversation } from '@corpus/core/types';

import { AppSidebar, ChatComposer, ChatHeader, MessageList, SourcePanel } from '@/components/chat';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useTheme } from '@/hooks';
import { getChatHistory, sendChat } from '@/services/chat';
import { getConversations } from '@/services/conversation';
import { streamParserRead } from '@/utils';

/** 空态的建议问句，纯文案 */
const SUGGESTIONS = [
    '这个项目的技术栈是什么？',
    '为什么核心要冻结得晚一点？',
    '评测集应该包含哪些类型的问题？',
];

export function ChatPage() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeId, setActiveId] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [busy, setBusy] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [input, setInput] = useState('');
    const { theme, toggleTheme } = useTheme();

    const activeConversation = conversations.find((item) => item.id === activeId);
    const citations =
        messages.findLast((message) => (message.citations?.length ?? 0) > 0)?.citations ?? [];

    useEffect(() => {
        getConversations()
            .then(setConversations)
            .catch((error: unknown) => console.error('加载会话列表失败', error));
    }, []);

    async function refreshConversations() {
        try {
            setConversations(await getConversations());
        } catch (error) {
            console.error('加载会话列表失败', error);
        }
    }

    function handleNew() {
        setActiveId('');
        setMessages([]);
        setInput('');
        setSidebarOpen(false);
    }

    async function handleSelect(id: string) {
        if (activeId === id || id === '') return;
        setActiveId(id);
        setSidebarOpen(false);

        try {
            setMessages(await getChatHistory(id));
        } catch (error) {
            console.error('加载历史消息失败', error);
            setMessages([]);
        }
    }

    /** 往最后一条助手消息上追加正文 */
    function appendText(text: string) {
        setMessages((current) => {
            const last = current.at(-1);
            if (!last || last.role !== 'assistant') return current;
            return [...current.slice(0, -1), { ...last, content: last.content + text }];
        });
    }

    function showError(message: string) {
        setMessages((current) => {
            const last = current.at(-1);
            if (!last || last.role !== 'assistant') return current;
            return [...current.slice(0, -1), { ...last, content: `出错了：${message}` }];
        });
    }

    async function handleSubmit() {
        const question = input.trim();
        if (!question || busy) return;

        const history: ChatMessage[] = [
            ...messages,
            { id: crypto.randomUUID(), role: 'user', content: question },
        ];
        const replyId = crypto.randomUUID();

        setMessages([...history, { id: replyId, role: 'assistant', content: '' }]);
        setInput('');
        setBusy(true);

        try {
            const response = await sendChat({
                conversationId: activeId || undefined,
                messages: history.map(({ role, content }) => ({ role, content })),
            });

            for await (const frame of streamParserRead(response.body)) {
                switch (frame.type) {
                    case 'created':
                        // 第一帧带回会话 id：这一刻会话才算真的建起来
                        setActiveId(frame.conversationId);
                        void refreshConversations();
                        break;
                    case 'text':
                        appendText(frame.text);
                        break;
                    case 'error':
                        showError(frame.message);
                        break;
                    case 'done':
                    case 'stopped':
                        break;
                }
            }
        } catch (error) {
            showError(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    }

    const sidebar = (
        <AppSidebar
            conversations={conversations}
            activeId={activeId}
            onSelect={handleSelect}
            onNew={handleNew}
        />
    );

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

                    <MessageList
                        messages={messages}
                        suggestions={SUGGESTIONS}
                        onPickSuggestion={setInput}
                    />

                    <ChatComposer value={input} onChange={setInput} onSubmit={handleSubmit} />
                </main>

                {/* 出处常驻：宽屏显示，窄屏退回消息下方的一行链接 */}
                <SourcePanel citations={citations} />
            </div>
        </TooltipProvider>
    );
}
