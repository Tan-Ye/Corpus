import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { getDesktopBridge } from '@/services/settings';
import type { AppInfo, UpdateCheckResult } from '@/services/settings';

interface AboutDialogProps {
    open: boolean;
    onClose: () => void;
}

/**
 * 关于 / 检查更新。
 *
 * 更新源是 GitHub Releases（Tan-Ye/Corpus）。网页版（浏览器打开）没有
 * preload 桥，按钮置灰并说明「仅桌面版可用」——不做假的成功提示。
 */
export function AboutDialog({ open, onClose }: AboutDialogProps) {
    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="flex flex-col">
                <AboutContent key={String(open)} onClose={onClose} />
            </DialogContent>
        </Dialog>
    );
}

function AboutContent({ onClose }: { onClose: () => void }) {
    const bridge = getDesktopBridge();
    const [info, setInfo] = useState<AppInfo | null>(null);
    const [checking, setChecking] = useState(false);
    const [result, setResult] = useState<UpdateCheckResult | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!bridge) {
            return;
        }

        let cancelled = false;

        bridge
            .getAppInfo()
            .then((next) => {
                if (!cancelled) {
                    setInfo(next);
                }
            })
            .catch(() => {
                // 拿不到版本就显示「未知」，不影响检查更新
            });

        return () => {
            cancelled = true;
        };
    }, [bridge]);

    async function handleCheck() {
        if (!bridge) {
            return;
        }

        setChecking(true);
        setError('');
        setResult(null);

        try {
            setResult(await bridge.checkUpdate());
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setChecking(false);
        }
    }

    return (
        <>
            <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
                <DialogTitle className="text-sm">关于 Corpus</DialogTitle>
                <button
                    type="button"
                    aria-label="关闭"
                    onClick={onClose}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                >
                    <X className="size-4" />
                </button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
                <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">
                        Corpus {info?.version ?? '（读取中…）'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        本地文档知识库问答：你的资料，一个有据可查的整体。
                    </span>
                </div>

                {!bridge && (
                    <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                        检测更新只在桌面版可用；浏览器里打开时没有版本信息。
                    </p>
                )}

                {result?.status === 'update' && (
                    <div className="flex flex-col gap-2 rounded-md bg-muted px-3 py-2 text-xs">
                        <span className="text-foreground">
                            有新版本 {result.latest}（当前 {result.current}）
                        </span>
                        {result.url && (
                            <a
                                className="w-fit text-foreground underline underline-offset-4"
                                href={result.url}
                                target="_blank"
                                rel="noreferrer"
                            >
                                打开发布页下载
                            </a>
                        )}
                    </div>
                )}

                {result?.status === 'latest' && (
                    <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                        已是最新版本（{result.current}）。
                    </p>
                )}

                {result?.status === 'error' && (
                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {result.error ?? '检查更新失败'}
                    </p>
                )}

                {error && (
                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {error}
                    </p>
                )}
            </div>

            <footer className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2">
                <Button
                    variant="outline"
                    size="sm"
                    disabled={checking || !bridge}
                    onClick={() => void handleCheck()}
                >
                    {checking && <Loader2 className="size-3.5 animate-spin" />}
                    检查更新
                </Button>
                <Button variant="ghost" size="sm" onClick={onClose}>
                    关闭
                </Button>
            </footer>
        </>
    );
}
