import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, ScrollText, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    clearLogs,
    getLogStats,
    listLogConversations,
    listLogs,
} from '@/services/logs';
import type { LogConversation, LogEntry, LogStats } from '@/services/logs';
import { cn } from '@/utils';

type RangeKey = 'all' | 'hour' | 'day' | 'week';

const RANGES: { key: RangeKey; label: string; ms: number }[] = [
    { key: 'all', label: '全部', ms: 0 },
    { key: 'hour', label: '1 小时', ms: 60 * 60 * 1000 },
    { key: 'day', label: '24 小时', ms: 24 * 60 * 60 * 1000 },
    { key: 'week', label: '7 天', ms: 7 * 24 * 60 * 60 * 1000 },
];

const PAGE_SIZE = 50;

function rangeFilter(key: RangeKey): { from?: number } {
    const ms = RANGES.find((item) => item.key === key)?.ms ?? 0;
    return ms > 0 ? { from: Date.now() - ms } : {};
}

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

function formatTime(timestamp: number): string {
    const date = new Date(timestamp);

    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * 日志面板：左侧按会话筛，右侧是记录列表。
 * 只记结构化信息，不记对话正文。
 */
export function LogsPanel() {
    const [range, setRange] = useState<RangeKey>('all');
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [conversations, setConversations] = useState<LogConversation[]>([]);
    const [items, setItems] = useState<LogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [stats, setStats] = useState<LogStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [confirmingRange, setConfirmingRange] = useState(false);
    const [confirmingClear, setConfirmingClear] = useState(false);

    // 会话列表只在挂载和删除后刷新；拿到后默认选中最近的一个
    useEffect(() => {
        listLogConversations()
            .then((list) => {
                setConversations(list);
                setConversationId((current) => current ?? list[0]?.id ?? null);
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        let cancelled = false;

        const filter = {
            ...rangeFilter(range),
            conversationId: conversationId ?? undefined,
        };

        Promise.all([listLogs({ ...filter, limit: PAGE_SIZE }), getLogStats()])
            .then(([page, nextStats]) => {
                if (cancelled) {
                    return;
                }
                setItems(page.items);
                setTotal(page.total);
                setStats(nextStats);
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : String(err));
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [range, conversationId]);

    async function reloadConversations() {
        try {
            setConversations(await listLogConversations());
        } catch {
            // 会话列表刷不出来不影响主列表
        }
    }

    async function loadMore() {
        setLoading(true);

        try {
            const page = await listLogs({
                ...rangeFilter(range),
                conversationId: conversationId ?? undefined,
                limit: PAGE_SIZE,
                offset: items.length,
            });
            setItems((current) => [...current, ...page.items]);
            setTotal(page.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }

    async function handleDeleteRange() {
        if (!confirmingRange) {
            setConfirmingRange(true);
            return;
        }

        setLoading(true);
        setError('');

        try {
            await clearLogs({
                ...rangeFilter(range),
                conversationId: conversationId ?? undefined,
            });
            const page = await listLogs({
                ...rangeFilter(range),
                conversationId: conversationId ?? undefined,
                limit: PAGE_SIZE,
            });
            setItems(page.items);
            setTotal(page.total);
            setStats(await getLogStats());
            await reloadConversations();
            setConfirmingRange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }

    async function handleClearAll() {
        if (!confirmingClear) {
            setConfirmingClear(true);
            return;
        }

        setLoading(true);
        setError('');

        try {
            await clearLogs({ all: true });
            setItems([]);
            setTotal(0);
            setStats(await getLogStats());
            setConversations([]);
            setConfirmingClear(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }

    const hint = buildHint(stats, total);

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                <ScrollText className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-medium">日志</h2>
                <span className="text-xs text-muted-foreground">共 {total} 条</span>

                <div className="ml-auto flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => setRange((current) => current)}
                        aria-label="刷新"
                    >
                        <RefreshCw className="size-4" />
                    </Button>
                    <Button
                        variant={confirmingClear ? 'destructive' : 'outline'}
                        size="sm"
                        disabled={loading || (total === 0 && conversations.length === 0)}
                        onClick={() => void handleClearAll()}
                    >
                        <Trash2 className="size-3.5" />
                        {confirmingClear ? '确认清空' : '清空日志'}
                    </Button>
                </div>
            </header>

            {hint && (
                <div className="flex items-start gap-2 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>{hint}</span>
                </div>
            )}

            <div className="flex min-h-0 flex-1">
                <aside className="w-48 shrink-0 overflow-auto border-r p-2">
                    {conversations.length === 0 ? (
                        <p className="px-2 py-3 text-xs text-muted-foreground">还没有日志</p>
                    ) : (
                        conversations.map((conversation) => (
                            <ConversationRow
                                key={conversation.id}
                                label={conversation.title}
                                count={conversation.count}
                                active={conversationId === conversation.id}
                                onClick={() => setConversationId(conversation.id)}
                            />
                        ))
                    )}
                </aside>

                <section className="flex min-w-0 flex-1 flex-col">
                    <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
                        {RANGES.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => {
                                    setRange(item.key);
                                    setConfirmingRange(false);
                                }}
                                className={cn(
                                    'rounded-md px-2 py-1 text-xs transition-colors',
                                    range === item.key
                                        ? 'bg-accent text-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {item.label}
                            </button>
                        ))}

                        <Button
                            variant={confirmingRange ? 'destructive' : 'outline'}
                            size="sm"
                            className="ml-auto"
                            disabled={loading || total === 0}
                            onClick={() => void handleDeleteRange()}
                        >
                            {confirmingRange ? `确认删除 ${total} 条` : '删除本范围'}
                        </Button>
                    </div>

                    {error && (
                        <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <div className="min-h-0 flex-1 overflow-auto">
                        {items.length === 0 ? (
                            <p className="p-4 text-sm text-muted-foreground">
                                这个范围内没有日志。
                            </p>
                        ) : (
                            items.map((item) => <LogRow key={item.id} item={item} />)
                        )}

                        {items.length < total && (
                            <div className="p-3">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    disabled={loading}
                                    onClick={() => void loadMore()}
                                >
                                    {loading && <Loader2 className="size-3.5 animate-spin" />}
                                    加载更多（还剩 {total - items.length} 条）
                                </Button>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}

interface ConversationRowProps {
    label: string;
    count: number;
    active: boolean;
    onClick: () => void;
}

function ConversationRow({ label, count, active, onClick }: ConversationRowProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                active
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
        >
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <span className="shrink-0 text-muted-foreground/70">{count}</span>
        </button>
    );
}

const TYPE_LABELS: Record<string, string> = {
    tool: '工具',
    llm: 'LLM',
    error: '错误',
    retrieval: '检索',
};

function LogRow({ item }: { item: LogEntry }) {
    return (
        <div className="border-b px-4 py-2 text-xs last:border-b-0">
            <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{formatTime(item.createdAt)}</span>

                <span
                    className={cn(
                        'rounded px-1.5 py-0.5 text-[10px]',
                        item.type === 'error'
                            ? 'bg-destructive/15 text-destructive'
                            : 'bg-muted text-muted-foreground',
                    )}
                >
                    {TYPE_LABELS[item.type] ?? item.type}
                </span>

                <span className="min-w-0 flex-1 truncate font-mono">{item.name}</span>

                {item.durationMs !== undefined && (
                    <span className="text-muted-foreground">
                        {(item.durationMs / 1000).toFixed(1)}s
                    </span>
                )}

                <span className={item.ok ? 'text-muted-foreground' : 'text-destructive'}>
                    {item.ok ? '✓' : '✗'}
                </span>
            </div>

            {item.detail && (
                <p
                    className={cn(
                        'mt-1 truncate font-mono text-[11px]',
                        item.ok ? 'text-muted-foreground/70' : 'text-destructive/80',
                    )}
                >
                    {item.detail}
                </p>
            )}
        </div>
    );
}

function buildHint(stats: LogStats | null, total: number): string {
    if (!stats) {
        return '';
    }

    if (stats.stale > 0) {
        return `有 ${stats.stale} 条日志属于 30 天未更新的会话，可以清理。`;
    }

    if (total > 1000) {
        return `日志已有 ${total} 条，建议按时间范围清理一次。`;
    }

    return '';
}
