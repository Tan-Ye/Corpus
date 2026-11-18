import { useEffect, useState } from 'react';
import { FileText, Loader2, X } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { getDocumentContent } from '@/services/documents';
import type { DocumentContent } from '@/services/documents';
import type { Citation } from '@corpus/core/types';
import { cn } from '@/utils';

/** 打开时在命中范围前后多取几行，方便看上下文 */
const CONTEXT_LINES = 5;

interface CitationViewerProps {
    citation: Citation | null;
    onClose: () => void;
}

interface LoadedState {
    documentId: string | null;
    content: DocumentContent | null;
    error: string;
}

/**
 * 原文查看器：展示引用片段在 markdown 里的原始行，命中范围高亮。
 *
 * 只取需要的那一段（命中行 ± 5 行），不把整篇法规发给前端。
 */
export function CitationViewer({ citation, onClose }: CitationViewerProps) {
    const [state, setState] = useState<LoadedState>({
        documentId: null,
        content: null,
        error: '',
    });

    const documentId = citation?.documentId ?? '';
    const startLine = citation?.startLine ?? 1;
    const endLine = citation?.endLine ?? startLine;

    useEffect(() => {
        if (!documentId) {
            return;
        }

        let cancelled = false;

        getDocumentContent(
            documentId,
            Math.max(1, startLine - CONTEXT_LINES),
            endLine + CONTEXT_LINES,
        )
            .then((result) => {
                if (!cancelled) {
                    setState({ documentId, content: result, error: '' });
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setState({
                        documentId,
                        content: null,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [documentId, startLine, endLine]);

    // 换了一条引用但数据还没回来时，不能显示上一条的原文
    const isCurrent = state.documentId === documentId;
    const content = isCurrent ? state.content : null;
    const error = isCurrent ? state.error : '';
    const loading = Boolean(documentId) && !isCurrent;

    return (
        <Dialog open={citation !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="flex max-h-[80vh] flex-col">
                <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                    <FileText className="size-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                        <DialogTitle className="truncate text-sm">{citation?.title}</DialogTitle>
                        <p className="truncate text-xs text-muted-foreground">
                            {citation?.locator}
                            {content && ` · 共 ${content.totalLines} 行`}
                        </p>
                    </div>
                    <button
                        type="button"
                        aria-label="关闭"
                        onClick={onClose}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                        <X className="size-4" />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-auto">
                    {!documentId ? (
                        <p className="p-4 text-sm text-muted-foreground">
                            这条引用没有关联文档（可能是旧记录），无法定位原文。
                        </p>
                    ) : loading ? (
                        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            加载原文…
                        </p>
                    ) : error ? (
                        <p className="p-4 text-sm text-destructive">{error}</p>
                    ) : content ? (
                        <ol className="py-2 font-mono text-xs leading-6">
                            {content.lines.map((line, index) => {
                                const lineNumber = content.startLine + index;
                                const highlighted = lineNumber >= startLine && lineNumber <= endLine;

                                return (
                                    <li
                                        key={lineNumber}
                                        className={cn(
                                            'flex gap-3 px-4',
                                            highlighted && 'bg-brand/10',
                                        )}
                                    >
                                        <span className="w-10 shrink-0 text-right text-muted-foreground/60 select-none">
                                            {lineNumber}
                                        </span>
                                        <span className="whitespace-pre-wrap break-words">
                                            {line || ' '}
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                    ) : null}
                </div>

                <footer className="shrink-0 border-t px-4 py-2 text-xs text-muted-foreground">
                    高亮的是引用范围 {citation?.locator}；原文是入库时的 markdown，不是 PDF 本身。
                </footer>
            </DialogContent>
        </Dialog>
    );
}
