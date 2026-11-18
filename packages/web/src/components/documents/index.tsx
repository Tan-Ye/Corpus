import { useEffect, useRef, useState } from 'react';
import {
    FileText,
    FolderCog,
    Loader2,
    Pencil,
    RefreshCw,
    Search,
    Trash2,
    Upload,
    X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
    ACCEPTED_EXTENSIONS,
    MAX_UPLOAD_BYTES,
    deleteDocument,
    listDocuments,
    reindexDocuments,
    searchDocuments,
    updateDocument,
    uploadDocument,
} from '@/services/documents';
import type { DocumentRow, SearchResult } from '@/services/documents';
import { getDocumentStorage, saveDocumentStorage } from '@/services/settings';
import { cn } from '@/utils';

/**
 * 文档库：上传 PDF / Word / Markdown，解析入库后可以在这里检索。
 *
 * 上传前必须先设置文件存储位置（绝对路径）——源文件和解析产物都要落盘，
 * 没设置的话服务端也会拒绝，前端这里直接把上传按钮禁掉并给提示。
 */
export function DocumentsPanel() {
    const [documents, setDocuments] = useState<DocumentRow[]>([]);
    const [storagePath, setStoragePath] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [confirmingId, setConfirmingId] = useState('');
    /** 正在编辑的文档：非 null 时弹出编辑框 */
    const [editingDocument, setEditingDocument] = useState<DocumentRow | null>(null);
    const [draftTitle, setDraftTitle] = useState('');
    const [draftDescription, setDraftDescription] = useState('');
    /** 选完文件先填用途，确认后才真正上传 */
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [uploadDescription, setUploadDescription] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [migrateFiles, setMigrateFiles] = useState(false);
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [result, setResult] = useState<SearchResult | null>(null);

    const [settingsOpen, setSettingsOpen] = useState(false);
    const [pathInput, setPathInput] = useState('');
    const [savingPath, setSavingPath] = useState(false);
    const [settingsError, setSettingsError] = useState('');

    /** 上传进度：null 表示没有在进行中的上传 */
    const [uploadPercent, setUploadPercent] = useState<number | null>(null);
    const [reindexing, setReindexing] = useState(false);
    const [confirmingReindex, setConfirmingReindex] = useState(false);

    const fileInput = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        let cancelled = false;

        Promise.all([listDocuments(), getDocumentStorage()])
            .then(([list, storage]) => {
                if (cancelled) {
                    return;
                }
                setDocuments(list);
                setStoragePath(storage.storagePath);
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : String(err));
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    async function refresh() {
        setLoading(true);

        try {
            setDocuments(await listDocuments());
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }

    function openSettings() {
        setPathInput(storagePath ?? '');
        setMigrateFiles(false);
        setSettingsError('');
        setSettingsOpen(true);
    }

    async function handleSaveStoragePath() {
        setSavingPath(true);
        setSettingsError('');

        try {
            const saved = await saveDocumentStorage(pathInput.trim(), migrateFiles);
            setStoragePath(saved.storagePath);
            setSettingsOpen(false);

            if (saved.migration) {
                const missing =
                    saved.migration.missing.length > 0
                        ? `，${saved.migration.missing.length} 个文件找不到`
                        : '';
                setNotice(
                    `存储位置已设为 ${saved.storagePath}，迁移了 ${saved.migration.movedDocuments} 篇文档${missing}`,
                );
            } else {
                setNotice(`文件存储位置已设为 ${saved.storagePath}`);
            }
        } catch (err) {
            setSettingsError(err instanceof Error ? err.message : String(err));
        } finally {
            setSavingPath(false);
        }
    }

    function openEdit(document: DocumentRow) {
        setEditingDocument(document);
        setDraftTitle(document.title);
        setDraftDescription(document.description ?? '');
        setError('');
    }

    async function commitEdit() {
        const document = editingDocument;

        if (!document) {
            return;
        }

        const title = draftTitle.trim();

        if (!title) {
            setError('标题不能为空');
            return;
        }

        setSavingEdit(true);

        try {
            const updated = await updateDocument(document.id, {
                title,
                description: draftDescription.trim(),
            });

            setDocuments((current) =>
                current.map((item) =>
                    item.id === document.id
                        ? { ...item, title: updated.title, description: updated.description }
                        : item,
                ),
            );
            setEditingDocument(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSavingEdit(false);
        }
    }

    /** 选文件只做校验，真正的上传等用户填完用途再点确认 */
    function pickFile(file: File | undefined) {
        if (!file) {
            return;
        }

        if (!storagePath) {
            setError('请先在「上传设置」里指定文件存储位置（绝对路径）');
            return;
        }

        const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;

        if (!ACCEPTED_EXTENSIONS.includes(extension)) {
            setError(`不支持的文件类型：${extension}，目前支持 ${ACCEPTED_EXTENSIONS.join(' / ')}`);
            return;
        }

        if (file.size > MAX_UPLOAD_BYTES) {
            setError(
                `文件太大（${(file.size / 1024 / 1024).toFixed(1)}MB），上限 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB`,
            );
            return;
        }

        setError('');
        setNotice('');
        setUploadDescription('');
        setPendingFile(file);
    }

    async function confirmUpload() {
        const file = pendingFile;

        if (!file) {
            return;
        }

        setPendingFile(null);
        setUploading(true);
        setUploadPercent(0);
        setError('');
        setNotice('');

        try {
            const uploaded = await uploadDocument(file, setUploadPercent, uploadDescription.trim());
            setNotice(
                uploaded.deduplicated
                    ? `这份内容已经在库里（${uploaded.chunkCount} 块），没有重复入库`
                    : `已入库：${uploaded.format.toUpperCase()} 解析出 ${uploaded.headingCount} 节、${uploaded.chunkCount} 块`,
            );
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setUploading(false);
            setUploadPercent(null);
            if (fileInput.current) {
                fileInput.current.value = '';
            }
        }
    }

    async function handleReindex() {
        if (!confirmingReindex) {
            setConfirmingReindex(true);
            return;
        }

        setReindexing(true);
        setError('');
        setNotice('');

        try {
            const reindexed = await reindexDocuments();
            const skipped =
                reindexed.skipped.length > 0 ? `，跳过 ${reindexed.skipped.length} 篇` : '';
            setNotice(`已重建 ${reindexed.rebuilt} 篇文档的索引${skipped}`);
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setReindexing(false);
            setConfirmingReindex(false);
        }
    }

    async function handleDelete(id: string, purgeFiles: boolean) {
        try {
            await deleteDocument(id, purgeFiles);
            setDocuments((current) => current.filter((item) => item.id !== id));
            setConfirmingId('');
            setResult(null);
            setNotice(purgeFiles ? '文档和磁盘文件已删除' : '文档索引已删除，磁盘文件保留');
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }

    async function handleSearch() {
        const text = query.trim();

        if (!text) {
            return;
        }

        setSearching(true);
        setError('');

        try {
            setResult(await searchDocuments(text));
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSearching(false);
        }
    }

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                <FileText className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-medium">文档库</h2>
                <span className="text-xs text-muted-foreground">{documents.length} 篇</span>

                <div className="ml-auto flex items-center gap-2">
                    <input
                        ref={fileInput}
                        type="file"
                        accept=".md,.markdown,.txt,.docx,.pdf"
                        className="hidden"
                        onChange={(event) => pickFile(event.target.files?.[0])}
                    />
                    <Button variant="ghost" size="sm" onClick={openSettings}>
                        <FolderCog className="size-3.5" />
                        上传设置
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={reindexing || documents.length === 0}
                        onClick={() => void handleReindex()}
                    >
                        {reindexing && <Loader2 className="size-3.5 animate-spin" />}
                        {confirmingReindex ? '确认重建' : '重建索引'}
                    </Button>
                    <Button
                        size="sm"
                        disabled={uploading || !storagePath}
                        title={storagePath ? undefined : '请先设置文件存储位置'}
                        onClick={() => fileInput.current?.click()}
                    >
                        {uploading ? (
                            <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                            <Upload className="size-3.5" />
                        )}
                        上传文件
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="刷新"
                        onClick={() => void refresh()}
                    >
                        <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
                    </Button>
                </div>
            </header>

            {!storagePath && (
                <div className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                    还没有设置文件存储位置，上传按钮不可用。点右上角「上传设置」填一个绝对路径，
                    例如 <code className="font-mono">D:\Corpus\documents</code>。
                </div>
            )}

            {uploading && (
                <div className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                    <Loader2 className="mr-1 inline size-3 animate-spin" />
                    {uploadPercent !== null && uploadPercent < 100
                        ? `上传中 ${uploadPercent}%…`
                        : '解析并入库中，Word/PDF 可能要几秒…'}
                </div>
            )}

            {notice && (
                <div className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                    {notice}
                </div>
            )}

            {error && (
                <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
                    {error}
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto">
                {documents.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">
                        还没有文档。支持 Markdown / 纯文本 / Word（.docx）/ PDF。
                    </p>
                ) : (
                    documents.map((document) => (
                        <div
                            key={document.id}
                            className="flex items-center gap-3 border-b px-4 py-2 last:border-b-0"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="truncate text-sm">{document.title}</span>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {document.chunkCount} 块
                                    </span>
                                </div>
                                <p
                                    className={cn(
                                        'truncate text-xs',
                                        document.description
                                            ? 'text-muted-foreground'
                                            : 'text-muted-foreground/60',
                                    )}
                                >
                                    {document.description ??
                                        '未填用途：模型只能按标题判断什么时候查它'}
                                </p>
                                <p className="truncate text-xs text-muted-foreground/70">
                                    {document.source ?? '手动输入'}
                                    {document.markdownPath ? ' · 已生成 markdown' : ''}
                                </p>
                            </div>

                            {confirmingId === document.id ? (
                                <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => void handleDelete(document.id, false)}
                                    >
                                        只删索引
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => void handleDelete(document.id, true)}
                                    >
                                        连文件删除
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setConfirmingId('')}
                                    >
                                        取消
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-10"
                                        aria-label={`编辑 ${document.title}`}
                                        onClick={() => openEdit(document)}
                                    >
                                        <Pencil className="size-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-10"
                                        aria-label={`删除 ${document.title}`}
                                        onClick={() => setConfirmingId(document.id)}
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            <section className="shrink-0 border-t p-3">
                <div className="flex items-center gap-2">
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                void handleSearch();
                            }
                        }}
                        placeholder="试试检索：分块应该按什么切"
                        className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus-visible:border-ring"
                    />
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={searching || !query.trim()}
                        onClick={() => void handleSearch()}
                    >
                        {searching ? (
                            <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                            <Search className="size-3.5" />
                        )}
                        检索
                    </Button>
                </div>

                {result && (
                    <div className="mt-2 max-h-64 overflow-auto">
                        {result.belowThreshold ? (
                            <p className="px-1 py-2 text-xs text-muted-foreground">
                                资料里没有找到相关内容（低于相似度阈值）。
                            </p>
                        ) : (
                            result.hits.map((hit) => (
                                <div
                                    key={`${hit.chunk.documentId}-${hit.chunk.startLine}-${hit.chunk.headingPath.join('/')}`}
                                    className="border-b px-1 py-1.5 last:border-b-0"
                                >
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <span className="font-mono">{hit.score.toFixed(2)}</span>
                                        <span className="truncate">
                                            {hit.chunk.documentTitle} ›{' '}
                                            {hit.chunk.headingPath.join(' › ') || '前言'}
                                        </span>
                                        <span className="ml-auto shrink-0">
                                            L{hit.chunk.startLine}-{hit.chunk.endLine}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/80">
                                        {hit.chunk.text}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </section>

            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogContent>
                    <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
                        <DialogTitle>上传设置</DialogTitle>
                        <button
                            type="button"
                            aria-label="关闭"
                            onClick={() => setSettingsOpen(false)}
                            className="rounded p-1 text-muted-foreground hover:text-foreground"
                        >
                            <X className="size-4" />
                        </button>
                    </header>

                    <div className="flex flex-col gap-3 p-4">
                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">
                                文件存储位置（必须是绝对路径）
                            </span>
                            <input
                                value={pathInput}
                                onChange={(event) => {
                                    setPathInput(event.target.value);
                                    setSettingsError('');
                                }}
                                placeholder="D:\\Corpus\\documents"
                                className="h-8 w-full rounded-md border bg-background px-2 font-mono text-xs outline-none focus-visible:border-ring"
                            />
                        </label>

                        <p className="text-xs leading-5 text-muted-foreground">
                            源文件和解析出来的 markdown 都会放在这个目录下：
                            <br />
                            <code className="font-mono">&lt;目录&gt;\files\&lt;文档id&gt;\原文件名</code>
                            <br />
                            <code className="font-mono">&lt;目录&gt;\markdown\&lt;文档id&gt;.md</code>
                        </p>

                        {storagePath && (
                            <p className="text-xs text-muted-foreground">
                                当前：<span className="font-mono">{storagePath}</span>
                            </p>
                        )}

                        {storagePath && pathInput.trim() && pathInput.trim() !== storagePath && (
                            <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs">
                                <input
                                    type="checkbox"
                                    checked={migrateFiles}
                                    onChange={(event) => setMigrateFiles(event.target.checked)}
                                    className="mt-0.5"
                                />
                                <span>
                                    把旧目录里的文件迁移到新目录
                                    <span className="text-muted-foreground">
                                        （不勾选的话，旧文档虽然还能检索，但「查看原文」会找不到文件）
                                    </span>
                                </span>
                            </label>
                        )}

                        {settingsError && (
                            <p className="text-xs text-destructive">{settingsError}</p>
                        )}

                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                disabled={savingPath || !pathInput.trim()}
                                onClick={() => void handleSaveStoragePath()}
                            >
                                {savingPath && <Loader2 className="size-3.5 animate-spin" />}
                                保存
                            </Button>
                            <span className="text-xs text-muted-foreground">
                                保存时会先创建目录并试写一次，确认可写
                            </span>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={editingDocument !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditingDocument(null);
                    }
                }}
            >
                <DialogContent>
                    <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
                        <DialogTitle>编辑文档</DialogTitle>
                        <button
                            type="button"
                            aria-label="关闭"
                            onClick={() => setEditingDocument(null)}
                            className="rounded p-1 text-muted-foreground hover:text-foreground"
                        >
                            <X className="size-4" />
                        </button>
                    </header>

                    <div className="flex flex-col gap-3 p-4">
                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">标题</span>
                            <input
                                value={draftTitle}
                                onChange={(event) => setDraftTitle(event.target.value)}
                                maxLength={120}
                                className="h-10 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring"
                            />
                        </label>

                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">
                                用途描述（模型据此判断什么时候该查这篇）
                            </span>
                            <textarea
                                value={draftDescription}
                                onChange={(event) => setDraftDescription(event.target.value)}
                                rows={3}
                                maxLength={300}
                                placeholder="例如：民法典全文，回答民事法律条文问题时使用"
                                className="min-h-20 w-full resize-y rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring"
                            />
                        </label>

                        <p className="text-xs leading-5 text-muted-foreground">
                            不填也能检索，但模型只能靠标题猜什么时候用它。
                        </p>

                        <div className="flex items-center gap-2">
                            <Button
                                className="h-10"
                                disabled={savingEdit}
                                onClick={() => void commitEdit()}
                            >
                                {savingEdit && <Loader2 className="size-4 animate-spin" />}
                                保存
                            </Button>
                            <Button
                                variant="ghost"
                                className="h-10"
                                onClick={() => setEditingDocument(null)}
                            >
                                取消
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={pendingFile !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingFile(null);
                    }
                }}
            >
                <DialogContent>
                    <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
                        <DialogTitle>上传文件</DialogTitle>
                        <button
                            type="button"
                            aria-label="关闭"
                            onClick={() => setPendingFile(null)}
                            className="rounded p-1 text-muted-foreground hover:text-foreground"
                        >
                            <X className="size-4" />
                        </button>
                    </header>

                    <div className="flex flex-col gap-3 p-4">
                        <p className="truncate text-sm">{pendingFile?.name}</p>

                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">
                                用途描述（可选，模型据此判断什么时候查它）
                            </span>
                            <textarea
                                value={uploadDescription}
                                onChange={(event) => setUploadDescription(event.target.value)}
                                rows={3}
                                maxLength={300}
                                placeholder="例如：antd 组件库文档，回答前端组件用法时使用"
                                className="min-h-20 w-full resize-y rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring"
                            />
                        </label>

                        <div className="flex items-center gap-2">
                            <Button className="h-10" onClick={() => void confirmUpload()}>
                                开始上传
                            </Button>
                            <Button
                                variant="ghost"
                                className="h-10"
                                onClick={() => setPendingFile(null)}
                            >
                                取消
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
