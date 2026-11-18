import { useState } from 'react';
import { BookOpen, FileText } from 'lucide-react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { CitationViewer } from './citation-viewer';
import type { Citation } from '@corpus/core/types';

interface SourcePanelProps {
    citations: Citation[];
}

/**
 * 右侧「本次引用」：跟着最后一条带引用的回答，宽屏常驻。
 *
 * 点条目的「查看原文」打开 CitationViewer（居中弹窗），不挤占面板宽度。
 * 窄屏（< xl）隐藏，引用由消息列表下方的出处列表承担。
 */
export function SourcePanel({ citations }: SourcePanelProps) {
    const [viewing, setViewing] = useState<Citation | null>(null);

    return (
        <>
            <aside className="hidden w-80 shrink-0 flex-col border-l bg-muted/20 xl:flex">
                <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
                    <BookOpen className="size-4 text-muted-foreground" />
                    <h2 className="text-sm font-medium">本次引用</h2>
                    {citations.length > 0 && (
                        <span className="ml-auto text-xs text-brand">{citations.length} 处</span>
                    )}
                </div>

                <ScrollArea className="min-h-0 flex-1">
                    <div className="flex flex-col gap-3 p-4">
                        {citations.length === 0 ? (
                            <p className="px-1 py-6 text-xs leading-5 text-muted-foreground">
                                回答里每条结论都会挂原文出处，点开能跳回文档位置。
                            </p>
                        ) : (
                            citations.map((citation, index) => (
                                <article
                                    key={citation.id}
                                    className="rounded-xl border bg-background p-3"
                                >
                                    <div className="mb-2 flex items-baseline gap-1.5">
                                        <span className="text-xs text-muted-foreground">
                                            {index + 1}
                                        </span>
                                        <h3 className="min-w-0 flex-1 truncate text-xs font-medium">
                                            {citation.title}
                                        </h3>
                                        <span className="shrink-0 text-xs text-muted-foreground">
                                            {citation.locator}
                                        </span>
                                    </div>

                                    <blockquote className="border-l-2 pl-2 text-xs leading-6 text-muted-foreground">
                                        {citation.excerpt ?? '（原文片段待补）'}
                                    </blockquote>

                                    <div className="mt-2 flex items-center gap-2">
                                        {citation.provenance && (
                                            <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                                                {citation.provenance}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setViewing(citation)}
                                            className="ml-auto inline-flex h-10 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                        >
                                            <FileText className="size-3.5" />
                                            查看原文
                                        </button>
                                    </div>
                                </article>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </aside>

            <CitationViewer citation={viewing} onClose={() => setViewing(null)} />
        </>
    );
}
