import { useEffect, useRef, useState } from 'react';

import type { ChatMessage, Conversation } from '@corpus/core/types';

import { AppSidebar, ChatComposer, ChatHeader, MessageList } from '@/components/chat';
import type { ToolStatus } from '@/components/chat';
import { DbExplorerPanel } from '@/components/db-explorer';
import { LogsPanel } from '@/components/logs';
import { McpManager } from '@/components/mcp-manager';
import { PluginPanel } from '@/components/plugins/plugin-panel';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useDrawerWidth, useTheme } from '@/hooks';
import { getChatHistory, sendChat, stopChat } from '@/services/chat';
import { getConversations } from '@/services/conversation';
import { deleteConversation } from '@/services/conversation';
import { listPlugins, setPluginEnabled } from '@/services/plugins';
import { addCustomMcp, removeCustomMcp } from '@/services/plugins';
import type { McpManifestInput, PluginView } from '@/services/plugins';
import {
    getBuiltinFeatures,
    isBuiltinFeatureEnabled,
    setBuiltinFeatureEnabled,
} from '@/features';
import { cn, streamParserRead } from '@/utils';

/** 空态的建议问句，纯文案 */
const SUGGESTIONS = [
    '这个项目的技术栈是什么？',
    '为什么核心要冻结得晚一点？',
    '评测集应该包含哪些类型的问题？',
];

/** 刷新后恢复上次打开的会话 */
const ACTIVE_KEY = 'corpus:active-conversation';

/** 工具名的中文说明：插件名 + 工具名，界面上别直接露 mdn__search */
const TOOL_LABELS: Record<string, string> = {
    'mdn__search': 'MDN · 文档搜索',
    'mdn__get-doc': 'MDN · 读取文档',
    'mdn__get-compat': 'MDN · 兼容性数据',
};

function describeTool(name: string, status: 'start' | 'end'): ToolStatus {
    const label = TOOL_LABELS[name] ?? name;

    return {
        text: status === 'start' ? `正在查询 ${label}…` : `已查询 ${label}`,
        done: status === 'end',
    };
}

export function ChatPage() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeId, setActiveId] = useState(
        () => window.localStorage.getItem(ACTIVE_KEY) ?? '',
    );
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [dbOpen, setDbOpen] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [mcpOpen, setMcpOpen] = useState(false);
    const [pluginsOpen, setPluginsOpen] = useState(false);
    const [plugins, setPlugins] = useState<PluginView[]>([]);
    const [pluginPendingId, setPluginPendingId] = useState('');
    const [pluginError, setPluginError] = useState('');
    // 工具调用状态：只在流式期间显示，结束后清掉
    const [toolStatus, setToolStatus] = useState<ToolStatus | null>(null);
    // 内置功能的开关只在前端：存 localStorage，服务端不需要知道
    const [builtinFeatures, setBuiltinFeatures] = useState(getBuiltinFeatures);
    const { theme, toggleTheme } = useTheme();
    const { width: dbWidth, resizing, startResize } = useDrawerWidth();
    const {
        width: logsWidth,
        resizing: logsResizing,
        startResize: startLogsResize,
    } = useDrawerWidth();

    // 当前正在流式输出的会话 id，停止按钮要用；新会话在 created 帧到达前是空
    const streamingConversationId = useRef('');

    // 流式正文先攒在这里，每帧最多提交一次，避免每个 token 都重渲染 Markdown
    const pendingText = useRef('');
    const flushHandle = useRef<number | null>(null);

    const activeConversation = conversations.find((item) => item.id === activeId);

    // pluginList = 内置插件 + 内置功能（给「插件」抽屉用）；自定义 MCP 单独放弹窗
    const customPlugins = plugins.filter((plugin) => plugin.source === 'custom');
    const pluginList: PluginView[] = [
        ...plugins.filter((plugin) => plugin.source !== 'custom'),
        ...builtinFeatures,
    ];
    const dbEnabled = isBuiltinFeatureEnabled(builtinFeatures, 'db-explorer');
    const logsEnabled = isBuiltinFeatureEnabled(builtinFeatures, 'logs');
    const mcpEnabled = isBuiltinFeatureEnabled(builtinFeatures, 'mcp-manager');

    // 挂载时：拉会话列表 + 恢复上次打开的会话历史
    useEffect(() => {
        getConversations()
            .then(setConversations)
            .catch((err: unknown) => console.error('加载会话列表失败', err));

        const stored = window.localStorage.getItem(ACTIVE_KEY);
        if (stored) {
            getChatHistory(stored)
                .then(setMessages)
                .catch((err: unknown) => console.error('加载历史消息失败', err));
        }
    }, []);

    // 挂载时拉一次插件列表：侧栏「数据库」入口是否显示取决于它
    useEffect(() => {
        listPlugins()
            .then(setPlugins)
            .catch((err: unknown) =>
                setPluginError(err instanceof Error ? err.message : String(err)),
            );
    }, []);

    useEffect(() => {
        if (activeId) {
            window.localStorage.setItem(ACTIVE_KEY, activeId);
        } else {
            window.localStorage.removeItem(ACTIVE_KEY);
        }
    }, [activeId]);

    async function loadConversations() {
        try {
            setConversations(await getConversations());
        } catch (err) {
            console.error('加载会话列表失败', err);
        }
    }

    async function loadHistory(id: string) {
        try {
            setMessages(await getChatHistory(id));
        } catch (err) {
            console.error('加载历史消息失败', err);
            setMessages([]);
        }
    }

    function handleNew() {
        setActiveId('');
        setMessages([]);
        setInput('');
        setError('');
        setSidebarOpen(false);
    }

    async function handleSelect(id: string) {
        // 流式过程中切会话容易把消息写串，先禁止
        if (busy) {
            return;
        }

        setSidebarOpen(false);
        setActiveId(id);
        setError('');
        await loadHistory(id);
    }

    /** 删除会话：服务端软删并清掉它的日志；删的是当前会话就退回新会话状态 */
    async function handleDeleteConversation(id: string) {
        try {
            await deleteConversation(id);
            setConversations((current) => current.filter((item) => item.id !== id));

            if (id === activeId) {
                setActiveId('');
                setMessages([]);
                window.localStorage.removeItem(ACTIVE_KEY);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }

    /** 把攒下的正文一次性写进最后一条助手消息 */
    function flushPendingText() {
        const chunk = pendingText.current;
        pendingText.current = '';

        if (!chunk) {
            return;
        }

        setMessages((current) => {
            const last = current.at(-1);
            if (!last || last.role !== 'assistant') {
                return current;
            }
            return [...current.slice(0, -1), { ...last, content: last.content + chunk }];
        });
    }

    /** 往最后一条助手消息上追加正文（按帧合并） */
    function appendText(text: string) {
        pendingText.current += text;

        if (flushHandle.current !== null) {
            return;
        }

        flushHandle.current = window.requestAnimationFrame(() => {
            flushHandle.current = null;
            flushPendingText();
        });
    }

    /** 失败时把还没吐字的助手气泡删掉，别留一个空壳 */
    function dropEmptyReply() {
        setMessages((current) => {
            const last = current.at(-1);
            if (last?.role === 'assistant' && last.content === '') {
                return current.slice(0, -1);
            }
            return current;
        });
    }

    async function runChat(history: ChatMessage[]) {
        const replyId = crypto.randomUUID();

        setMessages([...history, { id: replyId, role: 'assistant', content: '' }]);
        setError('');
        setBusy(true);
        setToolStatus(null);
        streamingConversationId.current = activeId;
        pendingText.current = '';

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
                        streamingConversationId.current = frame.conversationId;
                        void loadConversations();
                        break;
                    case 'text':
                        appendText(frame.text);
                        break;
                    case 'error':
                        flushPendingText();
                        dropEmptyReply();
                        setError(frame.message);
                        break;
                    case 'tool':
                        // 工具开始/结束时更新一行状态，正文照常继续流
                        setToolStatus(describeTool(frame.name, frame.status));
                        break;
                    case 'done':
                    case 'stopped':
                        break;
                }
            }
        } catch (err) {
            flushPendingText();
            dropEmptyReply();
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            // 收尾：把最后一帧的残留写进去，再停掉待执行的 rAF
            if (flushHandle.current !== null) {
                window.cancelAnimationFrame(flushHandle.current);
                flushHandle.current = null;
            }
            flushPendingText();
            // 任何路径收尾都清一次空壳：流断了、上游没吐字、用户点停都算
            dropEmptyReply();

            streamingConversationId.current = '';
            setToolStatus(null);
            setBusy(false);
        }
    }

    function handleSubmit() {
        const question = input.trim();
        if (!question || busy) {
            return;
        }

        const history: ChatMessage[] = [
            ...messages,
            { id: crypto.randomUUID(), role: 'user', content: question },
        ];

        setInput('');
        void runChat(history);
    }

    /** 重跑上一次提问：去掉末尾的助手消息，历史最后一条必须是提问 */
    function handleRetry() {
        if (busy) {
            return;
        }

        const history = messages.at(-1)?.role === 'assistant' ? messages.slice(0, -1) : messages;
        if (history.at(-1)?.role !== 'user') {
            setError('');
            return;
        }

        void runChat(history);
    }

    async function handleStop() {
        const conversationId = streamingConversationId.current;
        if (!conversationId) {
            return;
        }

        try {
            await stopChat(conversationId);
        } catch (err) {
            console.error('停止生成失败', err);
        }
    }

    async function handleTogglePlugin(plugin: PluginView, enabled: boolean) {
        // 内置功能只改前端状态
        if (plugin.kind === 'builtin') {
            setBuiltinFeatures(setBuiltinFeatureEnabled(plugin.id, enabled));
            return;
        }

        setPluginPendingId(plugin.id);
        setPluginError('');

        try {
            const updated = await setPluginEnabled(plugin.id, enabled);
            setPlugins((current) =>
                current.map((item) => (item.id === updated.id ? updated : item)),
            );
        } catch (err) {
            setPluginError(err instanceof Error ? err.message : String(err));
        } finally {
            setPluginPendingId('');
        }
    }

    async function handleAddCustomMcp(manifest: McpManifestInput) {
        const created = await addCustomMcp(manifest);
        setPlugins((current) => [...current, created]);
    }

    async function handleRemoveCustomMcp(id: string) {
        await removeCustomMcp(id);
        setPlugins((current) => current.filter((item) => item.id !== id));
    }

    const sidebar = (
        <AppSidebar
            conversations={conversations}
            activeId={activeId}
            onSelect={handleSelect}
            onNew={handleNew}
            onDeleteConversation={handleDeleteConversation}
            onOpenDatabase={() => setDbOpen(true)}
            onOpenPlugins={() => setPluginsOpen(true)}
            onOpenLogs={() => setLogsOpen(true)}
            onOpenMcp={() => setMcpOpen(true)}
            dbEnabled={dbEnabled}
            logsEnabled={logsEnabled}
            mcpEnabled={mcpEnabled}
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

                {/* 数据库浏览器：内置功能，关掉后入口和接口一起失效；宽度可拖 */}
                <Sheet open={dbOpen && dbEnabled} onOpenChange={setDbOpen}>
                    <SheetContent
                        side="right"
                        className={cn('gap-0 p-0', resizing && 'transition-none')}
                        // maxWidth 必须显式写：SheetContent 自带 data-[side=right]:sm:max-w-sm，
                        // 会把宽度锁死在 24rem。变体优先级比普通类高，只能内联盖
                        style={{ width: dbWidth, maxWidth: 'none' }}
                        showCloseButton={false}
                    >
                        <div
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="拖动调整宽度"
                            onPointerDown={startResize}
                            className={cn(
                                'absolute inset-y-0 left-0 z-10 flex w-2 cursor-col-resize touch-none items-center justify-center select-none',
                                'hover:bg-accent',
                                resizing && 'bg-accent',
                            )}
                        >
                            <span className="h-8 w-0.5 rounded-full bg-border" />
                        </div>

                        <SheetTitle className="sr-only">数据库浏览器</SheetTitle>
                        <DbExplorerPanel />
                    </SheetContent>
                </Sheet>

                {/* 日志：内置功能，展示工具调用 / LLM 轮次 / 错误；宽度可拖 */}
                <Sheet open={logsOpen && logsEnabled} onOpenChange={setLogsOpen}>
                    <SheetContent
                        side="right"
                        className={cn('gap-0 p-0', logsResizing && 'transition-none')}
                        style={{ width: logsWidth, maxWidth: 'none' }}
                        showCloseButton={false}
                    >
                        <div
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="拖动调整宽度"
                            onPointerDown={startLogsResize}
                            className={cn(
                                'absolute inset-y-0 left-0 z-10 flex w-2 cursor-col-resize touch-none items-center justify-center select-none',
                                'hover:bg-accent',
                                logsResizing && 'bg-accent',
                            )}
                        >
                            <span className="h-8 w-0.5 rounded-full bg-border" />
                        </div>

                        <SheetTitle className="sr-only">日志</SheetTitle>
                        <LogsPanel />
                    </SheetContent>
                </Sheet>

                {/* 额外 MCP：用户自己添加的服务，弹窗里管理 */}
                <McpManager
                    open={mcpOpen && mcpEnabled}
                    onOpenChange={setMcpOpen}
                    plugins={customPlugins}
                    pendingId={pluginPendingId}
                    onToggle={(plugin, enabled) => void handleTogglePlugin(plugin, enabled)}
                    onAdd={handleAddCustomMcp}
                    onRemove={handleRemoveCustomMcp}
                />

                {/* 插件：MCP 插件 + 内置功能，开关都交给服务端 */}
                <Sheet open={pluginsOpen} onOpenChange={setPluginsOpen}>
                    <SheetContent
                        side="right"
                        className="w-full gap-0 p-0 sm:max-w-md"
                        showCloseButton={false}
                    >
                        <SheetTitle className="sr-only">插件</SheetTitle>
                        <PluginPanel
                            plugins={pluginList}
                            pendingId={pluginPendingId}
                            error={pluginError}
                            onToggle={(plugin, enabled) => void handleTogglePlugin(plugin, enabled)}
                            onOpenMcp={() => {
                                setPluginsOpen(false);
                                setMcpOpen(true);
                            }}
                        />
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
                        conversationId={activeId}
                        messages={messages}
                        suggestions={SUGGESTIONS}
                        toolStatus={toolStatus}
                        busy={busy}
                        onPickSuggestion={setInput}
                    />

                    {error && (
                        <div className="mx-auto mb-1 flex w-full max-w-3xl items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
                            <span className="min-w-0 flex-1 truncate">请求失败：{error}</span>
                            <Button variant="outline" size="sm" onClick={handleRetry}>
                                重试
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setError('')}>
                                关闭
                            </Button>
                        </div>
                    )}

                    <ChatComposer
                        value={input}
                        busy={busy}
                        onChange={setInput}
                        onSubmit={handleSubmit}
                        onStop={handleStop}
                    />
                </main>
            </div>
        </TooltipProvider>
    );
}
