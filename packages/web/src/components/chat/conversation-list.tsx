import { useState } from 'react';
import { MessageSquare, Pencil, Search, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Conversation } from '@corpus/core/types';
import { searchConversations } from '@/services/conversation';
import type { ConversationSearchHit } from '@/services/conversation';
import { cn, groupConversationsByDay } from '@/utils';

interface ConversationListProps {
    conversations: Conversation[];
    activeId: string;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    onRename: (id: string, title: string) => Promise<void>;
}

export function ConversationList({
    conversations,
    activeId,
    onSelect,
    onDelete,
    onRename,
}: ConversationListProps) {
    const groups = groupConversationsByDay(conversations);
    // 待删除的会话：用弹窗再确认一次，避免误点
    const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);

    const [search, setSearch] = useState('');
    const [results, setResults] = useState<ConversationSearchHit[] | null>(null);
    const [searching, setSearching] = useState(false);

    const [editingId, setEditingId] = useState('');
    const [draftTitle, setDraftTitle] = useState('');

    async function runSearch() {
        const query = search.trim();

        if (!query) {
            setResults(null);
            return;
        }

        setSearching(true);

        try {
            setResults(await searchConversations(query));
        } catch {
            setResults([]);
        } finally {
            setSearching(false);
        }
    }

    function startRename(conversation: Conversation) {
        setEditingId(conversation.id);
        setDraftTitle(conversation.title);
    }

    async function commitRename() {
        const id = editingId;
        const title = draftTitle.trim();

        setEditingId('');

        if (id && title) {
            await onRename(id, title);
        }
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="px-3 pb-2">
                <div className="flex items-center gap-1 rounded-md border bg-background px-2">
                    <Search className="size-3.5 shrink-0 text-muted-foreground" />
                    <input
                        value={search}
                        onChange={(event) => {
                            const value = event.target.value;
                            setSearch(value);
                            if (!value.trim()) {
                                setResults(null);
                            }
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                void runSearch();
                            }
                            if (event.key === 'Escape') {
                                setSearch('');
                                setResults(null);
                            }
                        }}
                        placeholder="搜索会话，回车"
                        className="h-7 min-w-0 flex-1 bg-transparent text-xs outline-none"
                    />
                    {search && (
                        <button
                            type="button"
                            aria-label="清空搜索"
                            onClick={() => {
                                setSearch('');
                                setResults(null);
                            }}
                            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                        >
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
                <div className="flex flex-col gap-1 px-2 pb-4">
                    {results ? (
                        <SearchResults
                            results={results}
                            searching={searching}
                            activeId={activeId}
                            onSelect={onSelect}
                        />
                    ) : groups.length === 0 ? (
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
                                    const isEditing = editingId === conversation.id;

                                    if (isEditing) {
                                        return (
                                            <input
                                                key={conversation.id}
                                                autoFocus
                                                value={draftTitle}
                                                onChange={(event) =>
                                                    setDraftTitle(event.target.value)
                                                }
                                                onBlur={() => void commitRename()}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter') {
                                                        event.preventDefault();
                                                        void commitRename();
                                                    }
                                                    if (event.key === 'Escape') {
                                                        setEditingId('');
                                                    }
                                                }}
                                                className="mx-1 h-8 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring"
                                            />
                                        );
                                    }

                                    return (
                                        <div
                                            key={conversation.id}
                                            className="group relative"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => onSelect(conversation.id)}
                                                aria-current={isActive ? 'true' : undefined}
                                                className={cn(
                                                    'flex w-full items-center gap-2 rounded-lg px-2 py-2 pr-16 text-left text-sm transition-colors',
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

                                            <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5">
                                                <button
                                                    type="button"
                                                    aria-label={`重命名 ${conversation.title}`}
                                                    onClick={() => startRename(conversation)}
                                                    className="hidden rounded p-1 text-muted-foreground group-hover:block hover:text-foreground"
                                                >
                                                    <Pencil className="size-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label={`删除 ${conversation.title}`}
                                                    onClick={() => setDeleteTarget(conversation)}
                                                    className="hidden rounded p-1 text-muted-foreground group-hover:block hover:text-destructive"
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>
            </ScrollArea>

            <Dialog
                open={deleteTarget !== null}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
            >
                <DialogContent className="max-w-sm">
                    <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
                        <DialogTitle>删除会话</DialogTitle>
                        <button
                            type="button"
                            aria-label="关闭"
                            onClick={() => setDeleteTarget(null)}
                            className="rounded p-1 text-muted-foreground hover:text-foreground"
                        >
                            <X className="size-4" />
                        </button>
                    </header>

                    <div className="p-4">
                        <p className="text-sm">确定删除「{deleteTarget?.title}」？</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            会话内容和它的日志会一起删掉，无法恢复。
                        </p>
                    </div>

                    <footer className="flex shrink-0 justify-end gap-2 border-t px-4 py-2">
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>
                            取消
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                                if (deleteTarget) {
                                    onDelete(deleteTarget.id);
                                }
                                setDeleteTarget(null);
                            }}
                        >
                            删除
                        </Button>
                    </footer>
                </DialogContent>
            </Dialog>
        </div>
    );
}

interface SearchResultsProps {
    results: ConversationSearchHit[];
    searching: boolean;
    activeId: string;
    onSelect: (id: string) => void;
}

function SearchResults({ results, searching, activeId, onSelect }: SearchResultsProps) {
    if (searching) {
        return <p className="px-2 py-4 text-center text-xs text-muted-foreground">搜索中…</p>;
    }

    if (results.length === 0) {
        return <p className="px-2 py-4 text-center text-xs text-muted-foreground">没有匹配的会话</p>;
    }

    return (
        <>
            {results.map((conversation) => (
                <button
                    key={conversation.id}
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className={cn(
                        'flex flex-col gap-0.5 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                        conversation.id === activeId
                            ? 'bg-background font-medium text-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                >
                    <span className="w-full truncate">{conversation.title}</span>
                    {conversation.snippet && (
                        <span className="w-full truncate text-xs text-muted-foreground/70">
                            {conversation.snippet}
                        </span>
                    )}
                </button>
            ))}
        </>
    );
}
