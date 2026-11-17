import { useState } from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';

import { ScrollArea } from '@/components/ui/scroll-area';
import type { Conversation } from '@corpus/core/types';
import { cn, groupConversationsByDay } from '@/utils';

interface ConversationListProps {
    conversations: Conversation[];
    activeId: string;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
}

export function ConversationList({
    conversations,
    activeId,
    onSelect,
    onDelete,
}: ConversationListProps) {
    const groups = groupConversationsByDay(conversations);
    // 哪一行正在等确认；一次只允许一行
    const [confirmingId, setConfirmingId] = useState('');

    return (
        <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-1 px-2 pb-4">
                {groups.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                        还没有对话
                    </p>
                ) : (
                    groups.map((group) => (
                        <div key={group.label} className="flex flex-col">
                            <p className="px-2 pt-4 pb-1 text-xs text-muted-foreground/80">
                                {group.label}
                            </p>

                            {group.items.map((conversation) => {
                                const isActive = conversation.id === activeId;
                                const isConfirming = confirmingId === conversation.id;

                                return (
                                    <div key={conversation.id} className="group relative">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setConfirmingId('');
                                                onSelect(conversation.id);
                                            }}
                                            aria-current={isActive ? 'true' : undefined}
                                            className={cn(
                                                'flex w-full items-center gap-2 rounded-lg px-2 py-2 pr-9 text-left text-sm transition-colors',
                                                isActive
                                                    ? 'bg-background font-medium text-foreground shadow-sm'
                                                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                                            )}
                                        >
                                            <MessageSquare className="size-3.5 shrink-0 opacity-70" />
                                            <span className="min-w-0 flex-1 truncate">
                                                {conversation.title}
                                            </span>
                                        </button>

                                        {isConfirming ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setConfirmingId('');
                                                    onDelete(conversation.id);
                                                }}
                                                className="absolute top-1/2 right-1 -translate-y-1/2 rounded bg-destructive px-1.5 py-0.5 text-[10px] text-white"
                                            >
                                                确认删除
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setConfirmingId(conversation.id)}
                                                aria-label={`删除 ${conversation.title}`}
                                                className="absolute top-1/2 right-1 hidden -translate-y-1/2 rounded p-1 text-muted-foreground group-hover:block hover:text-destructive"
                                            >
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))
                )}
            </div>
        </ScrollArea>
    );
}
