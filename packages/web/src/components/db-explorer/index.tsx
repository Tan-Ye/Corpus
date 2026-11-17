import { useEffect, useState } from 'react';
import { Database, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/utils';
import { listTables, runQuery, PAGE_SIZE } from '@/services/db-explorer';
import type { QueryResult, TableInfo } from '@/services/db-explorer';

/**
 * 数据库浏览器面板。
 *
 * 走的是 MCP 插件（db-explorer）的工具调用，不是直连数据库：
 * 服务端只读打开 corpus.db，插件负责分页和结果截断。
 */
export function DbExplorerPanel() {
    const [tables, setTables] = useState<TableInfo[]>([]);
    const [sql, setSql] = useState('SELECT * FROM conversations');
    const [result, setResult] = useState<QueryResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        listTables()
            .then(setTables)
            .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    }, []);

    async function refreshTables() {
        try {
            setTables(await listTables());
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }

    async function run(nextSql: string, page: number) {
        if (!nextSql.trim() || loading) {
            return;
        }

        setSql(nextSql);
        setLoading(true);
        setError('');

        try {
            setResult(await runQuery(nextSql, page));
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }

    const page = result?.page ?? 1;
    const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                <Database className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-medium">数据库</h2>
                <span className="text-xs text-muted-foreground">{tables.length} 张表</span>

                <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-8"
                    onClick={() => void refreshTables()}
                    aria-label="刷新表列表"
                >
                    <RefreshCw className="size-4" />
                </Button>
            </header>

            <div className="flex min-h-0 flex-1">
                <aside className="w-44 shrink-0 overflow-auto border-r p-2">
                    {tables.length === 0 ? (
                        <p className="px-2 py-3 text-xs text-muted-foreground">没有读到表</p>
                    ) : (
                        tables.map((table) => (
                            <button
                                key={table.name}
                                type="button"
                                onClick={() => void run(`SELECT * FROM "${table.name}"`, 1)}
                                className={cn(
                                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                                    'text-muted-foreground hover:bg-accent hover:text-foreground',
                                )}
                            >
                                <span className="min-w-0 flex-1 truncate font-mono">{table.name}</span>
                                <span className="shrink-0 text-muted-foreground/70">{table.rows}</span>
                            </button>
                        ))
                    )}
                </aside>

                <section className="flex min-w-0 flex-1 flex-col">
                    <div className="shrink-0 border-b p-3">
                        <textarea
                            value={sql}
                            onChange={(event) => setSql(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                                    event.preventDefault();
                                    void run(sql, 1);
                                }
                            }}
                            spellCheck={false}
                            className="h-24 w-full resize-none rounded-lg border bg-muted/30 p-2 font-mono text-xs leading-5 outline-none focus-visible:border-ring"
                        />

                        <div className="mt-2 flex items-center gap-3">
                            <Button
                                size="sm"
                                disabled={loading}
                                onClick={() => void run(sql, 1)}
                            >
                                {loading ? '执行中…' : '执行'}
                            </Button>
                            <span className="text-xs text-muted-foreground">
                                Ctrl / ⌘ + Enter 执行 · 每页 {PAGE_SIZE} 行
                            </span>
                        </div>
                    </div>

                    {error && (
                        <div className="shrink-0 border-b bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <div className="min-h-0 flex-1 overflow-auto">
                        {result ? (
                            <table className="w-full border-collapse text-xs">
                                <thead className="sticky top-0 bg-background">
                                    <tr>
                                        {result.columns.map((column) => (
                                            <th
                                                key={column}
                                                className="border-b px-2 py-1.5 text-left font-medium whitespace-nowrap"
                                            >
                                                {column}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.rows.map((row, rowIndex) => (
                                        // 数据库结果没有稳定主键，按页 + 下标做 key
                                        <tr key={`${page}-${rowIndex}`} className="hover:bg-accent/50">
                                            {row.map((cell, cellIndex) => (
                                                <td
                                                    key={cellIndex}
                                                    className="max-w-96 truncate border-b px-2 py-1.5 font-mono"
                                                >
                                                    {cell === null ? (
                                                        <span className="text-muted-foreground/60">NULL</span>
                                                    ) : (
                                                        String(cell)
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p className="p-4 text-sm text-muted-foreground">
                                选左边一张表，或者写一条 SELECT 再执行。
                            </p>
                        )}

                        {result && result.rows.length === 0 && (
                            <p className="p-4 text-sm text-muted-foreground">没有数据。</p>
                        )}
                    </div>

                    {result && (
                        <footer className="flex shrink-0 items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
                            <span>
                                共 {result.total} 行 · 第 {page} / {totalPages} 页
                            </span>

                            <div className="ml-auto flex gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={loading || page <= 1}
                                    onClick={() => void run(sql, page - 1)}
                                >
                                    上一页
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={loading || page >= totalPages}
                                    onClick={() => void run(sql, page + 1)}
                                >
                                    下一页
                                </Button>
                            </div>
                        </footer>
                    )}
                </section>
            </div>
        </div>
    );
}
