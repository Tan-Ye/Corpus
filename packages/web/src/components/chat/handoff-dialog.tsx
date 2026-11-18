import { useEffect, useState } from 'react';
import { Copy, Loader2, RefreshCw, X } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/chat/markdown';
import { requestHandoff } from '@/services/conversation';

interface HandoffDialogProps {
    open: boolean;
    conversationId: string;
    onClose: () => void;
    /** 用摘要开新会话：把摘要带到输入框，由用户决定是否发送 */
    onStartNew: (summary: string) => void;
}

interface LoadState {
    status: 'idle' | 'loading' | 'ok' | 'error';
    summary: string;
    error: string;
}

const IDLE: LoadState = { status: 'idle', summary: '', error: '' };

/**
 * 交接摘要：会话快超出上下文时的退路。
 *
 * 生成一次摘要要调模型，所以只在用户点开时请求；失败可以直接重试。
 */
export function HandoffDialog({ open, conversationId, onClose, onStartNew }: HandoffDialogProps) {
    const [state, setState] = useState<LoadState>(IDLE);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!open || !conversationId) {
            return;
        }

        let cancelled = false;

        requestHandoff(conversationId)
            .then((result) => {
                if (!cancelled) {
                    setState({ status: 'ok', summary: result.summary, error: '' });
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setState({
                        status: 'error',
                        summary: '',
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [open, conversationId]);

    function retry() {
        setState({ status: 'loading', summary: '', error: '' });

        requestHandoff(conversationId)
            .then((result) => setState({ status: 'ok', summary: result.summary, error: '' }))
            .catch((err: unknown) =>
                setState({
                    status: 'error',
                    summary: '',
                    error: err instanceof Error ? err.message : String(err),
                }),
            );
    }

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(state.summary);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setState({ ...state, error: '复制失败，可以手动选中文本' });
        }
    }

    const loading = open && state.status !== 'ok' && state.status !== 'error';

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="flex max-h-[80vh] flex-col">
                <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                    <DialogTitle className="min-w-0 flex-1 text-sm">会话交接摘要</DialogTitle>
                    <button
                        type="button"
                        aria-label="关闭"
                        onClick={onClose}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                        <X className="size-4" />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-auto p-4">
                    {loading ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            正在整理这段对话…
                        </p>
                    ) : state.status === 'error' ? (
                        <div className="flex flex-col items-start gap-2">
                            <p className="text-sm text-destructive">{state.error}</p>
                            <Button variant="outline" size="sm" onClick={retry}>
                                <RefreshCw className="size-3.5" />
                                重试
                            </Button>
                        </div>
                    ) : (
                        <Markdown content={state.summary} />
                    )}
                </div>

                <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t px-4 py-2">
                    <Button
                        size="sm"
                        disabled={loading || !state.summary}
                        onClick={() => onStartNew(state.summary)}
                    >
                        用这份摘要开新会话
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={loading || !state.summary}
                        onClick={() => void handleCopy()}
                    >
                        <Copy className="size-3.5" />
                        {copied ? '已复制' : '复制'}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={loading} onClick={retry}>
                        <RefreshCw className="size-3.5" />
                        重新生成
                    </Button>
                    <span className="ml-auto text-xs text-muted-foreground">
                        摘要由模型生成，可能不完整，请核对关键结论
                    </span>
                </footer>
            </DialogContent>
        </Dialog>
    );
}
