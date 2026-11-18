import { useRef, useState } from 'react';
import { Download, Loader2, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { backupUrl, importBackup } from '@/services/backup';

interface BackupDialogProps {
    open: boolean;
    onClose: () => void;
}

/** 下载交给浏览器，不用再包一层 fetch */
function download(url: string) {
    const link = document.createElement('a');

    link.href = url;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
}

/**
 * 备份与恢复：一份 zip，里面是文档源文件 + 清单。
 *
 * 恢复时重新解析入库，所以备份不依赖数据库结构；
 * 会话、日志、设置不在备份里——会话需要时重新问一遍即可。
 */
export function BackupDialog({ open, onClose }: BackupDialogProps) {
    const [importing, setImporting] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const fileInput = useRef<HTMLInputElement | null>(null);

    async function handleImport(file: File | undefined) {
        if (!file) {
            return;
        }

        setImporting(true);
        setMessage('');
        setError('');

        try {
            const result = await importBackup(file);
            const skipped =
                result.skipped.length > 0
                    ? `，跳过 ${result.skipped.length} 个（${result.skipped[0]?.reason ?? ''}）`
                    : '';
            setMessage(`已恢复 ${result.imported} 篇文档${skipped}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setImporting(false);
            if (fileInput.current) {
                fileInput.current.value = '';
            }
        }
    }

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="flex max-h-[80vh] flex-col">
                <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
                    <DialogTitle className="text-sm">备份与恢复</DialogTitle>
                    <button
                        type="button"
                        aria-label="关闭"
                        onClick={onClose}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                        <X className="size-4" />
                    </button>
                </header>

                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
                    <p className="text-xs leading-5 text-muted-foreground">
                        备份是一个 zip：<code className="font-mono">manifest.json</code> 加每篇文档的原始文件。
                        恢复时重新解析、重新切块，所以分块规则以后改了也能用旧备份恢复。
                        <br />
                        不包含会话、日志和设置——这些需要时重新问一遍即可。
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => download(backupUrl())}>
                            <Download className="size-3.5" />
                            导出备份
                        </Button>

                        <input
                            ref={fileInput}
                            type="file"
                            accept=".zip"
                            className="hidden"
                            onChange={(event) => void handleImport(event.target.files?.[0])}
                        />

                        <Button size="sm" disabled={importing} onClick={() => fileInput.current?.click()}>
                            {importing ? (
                                <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                                <Upload className="size-3.5" />
                            )}
                            导入备份
                        </Button>
                    </div>

                    {importing && (
                        <p className="text-xs text-muted-foreground">
                            正在解析并重新入库，文档多的时候需要等一会儿…
                        </p>
                    )}

                    {message && (
                        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                            {message}
                        </p>
                    )}

                    {error && (
                        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            {error}
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
