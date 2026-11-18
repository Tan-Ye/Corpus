import { memo, useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import type { ChatMessage, Citation } from '@corpus/core/types';

import { CitationViewer } from './citation-viewer';
import { Markdown } from './markdown';

/** 工具调用的一行状态，流式期间才有 */
export interface ToolStatus {
    text: string;
    done: boolean;
}

interface MessageListProps {
    conversationId: string;
    messages: ChatMessage[];
    suggestions: string[];
    toolStatus: ToolStatus | null;
    /** 流式进行中：底部要显示活动指示，否则长时间没字看起来像卡死 */
    busy: boolean;
    onPickSuggestion: (text: string) => void;
}

export function MessageList({
    conversationId,
    messages,
    suggestions,
    toolStatus,
    busy,
    onPickSuggestion,
}: MessageListProps) {
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const lastCountRef = useRef(0);
    const lastConversationRef = useRef(conversationId);

    useEffect(() => {
        const node = bottomRef.current;
        if (!node) {
            return;
        }

        const viewport = node.closest('[data-slot="scroll-area-viewport"]');
        if (!(viewport instanceof HTMLElement)) {
            return;
        }

        // 切会话：计数要归零，否则新会话消息更少会被判成"不是新消息"
        const isNewConversation = conversationId !== lastConversationRef.current;
        if (isNewConversation) {
            lastConversationRef.current = conversationId;
            lastCountRef.current = 0;
        }

        const isNewMessage = messages.length > lastCountRef.current;
        lastCountRef.current = messages.length;

        // 刚切换过来，直接贴底，两边内容长度没得比
        if (isNewConversation) {
            node.scrollIntoView({ block: 'end' });
            return;
        }

        const distanceToBottom =
            viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;

        // 用户往上翻着看历史时不要抢滚动：只有来了新消息、或者本来就贴着底部才跟随
        if (isNewMessage || distanceToBottom < 120) {
            node.scrollIntoView({ block: 'end' });
        }
    }, [conversationId, messages]);

    return (
        <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto w-full max-w-3xl px-6 pt-8 pb-6">
                {messages.length === 0 ? (
                    <EmptyState suggestions={suggestions} onPickSuggestion={onPickSuggestion} />
                ) : (
                    <div className="flex flex-col gap-8">
                        {messages.map((message) =>
                            message.role === 'user' ? (
                                <UserMessage key={message.id} message={message} />
                            ) : (
                                <AssistantMessage key={message.id} message={message} />
                            ),
                        )}
                    </div>
                )}

                {busy && (
                    <div
                        className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"
                        aria-live="polite"
                    >
                        {toolStatus?.done ? (
                            <Check className="size-3.5" />
                        ) : (
                            <Loader2 className="size-3.5 animate-spin" />
                        )}
                        <span>{toolStatus?.text ?? '正在生成'}</span>
                        <TypingDots />
                    </div>
                )}

                {/* 滚动锚点：贴在内容最底部 */}
                <div ref={bottomRef} />
            </div>
        </ScrollArea>
    );
}

interface EmptyStateProps {
    suggestions: string[];
    onPickSuggestion: (text: string) => void;
}

function EmptyState({ suggestions, onPickSuggestion }: EmptyStateProps) {
    return (
        <div className="flex flex-col gap-10 pt-16">
            <div className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold tracking-tight">有什么可以帮你？</h2>
                <p className="text-sm text-muted-foreground">你的资料，一个有据可查的整体。</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
                {suggestions.map((text) => (
                    <Button
                        key={text}
                        variant="outline"
                        className="h-auto justify-start rounded-xl px-3.5 py-3 text-left text-sm font-normal whitespace-normal"
                        onClick={() => onPickSuggestion(text)}
                    >
                        {text}
                    </Button>
                ))}
            </div>
        </div>
    );
}

const UserMessage = memo(function UserMessage({ message }: { message: ChatMessage }) {
    return (
        <div className="flex justify-end">
            <p className="max-w-xl rounded-2xl bg-muted px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap">
                {message.content}
            </p>
        </div>
    );
});

/**
 * 用 memo 包住：流式时只有最后一条的 content 变化，
 * 历史消息的 message 对象引用没变，可以直接跳过重渲染。
 */
const AssistantMessage = memo(function AssistantMessage({ message }: { message: ChatMessage }) {
    const citations = message.citations ?? [];
    const [viewing, setViewing] = useState<Citation | null>(null);
    return (
        <div data-message-id={message.id}>
            <p className="mb-2 text-xs text-muted-foreground">CORPUS</p>

            <Markdown content={message.content} />

            {message.stopped && (
                <p className="mt-2 text-xs text-muted-foreground">（已停止生成）</p>
            )}

            {citations.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5 border-t pt-2">
                    <p className="text-xs text-muted-foreground">参考了这几段</p>

                    {citations.map((citation, index) => (
                        <div
                            key={citation.id}
                            data-citation-ref={index + 1}
                            className="group flex items-start gap-2 rounded-md px-1 py-1 text-xs transition-colors hover:bg-accent/50"
                        >
                            <span className="shrink-0 font-mono text-brand">[{index + 1}]</span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-muted-foreground">
                                    {citation.title}
                                    <span className="ml-1 text-muted-foreground/70">
                                        {citation.locator}
                                    </span>
                                </p>
                                {citation.excerpt && (
                                    <p className="line-clamp-2 text-muted-foreground/70">
                                        {citation.excerpt}
                                    </p>
                                )}
                            </div>
                            {citation.documentId && (
                                <button
                                    type="button"
                                    onClick={() => setViewing(citation)}
                                    className="shrink-0 rounded px-1.5 py-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
                                >
                                    查看原文
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <CitationViewer citation={viewing} onClose={() => setViewing(null)} />
        </div>
    );
});

/** 三个跳动的点：动画在 index.css 里，避免用行内 delay */
function TypingDots() {
    return (
        <span className="flex items-center gap-0.5" aria-hidden="true">
            <span className="corpus-dot size-1 rounded-full bg-current" />
            <span className="corpus-dot size-1 rounded-full bg-current" />
            <span className="corpus-dot size-1 rounded-full bg-current" />
        </span>
    );
}
