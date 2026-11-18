import { ArrowUp, BookOpen, Paperclip, Square } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ChatComposerProps {
    value: string;
    busy: boolean;
    /** 没配置模型时禁用输入：服务端会拒绝，前端先别让用户白打一段字 */
    disabled?: boolean;
    disabledHint?: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onStop: () => void;
}

export function ChatComposer({
    value,
    busy,
    disabled = false,
    disabledHint,
    onChange,
    onSubmit,
    onStop,
}: ChatComposerProps) {
    const canSubmit = value.trim().length > 0 && !disabled;

    function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key !== 'Enter' || event.shiftKey || disabled) {
            return;
        }

        // 中文输入法选词时按回车不是"发送"：isComposing 为 true，keyCode 229 是旧浏览器兜底
        if (event.nativeEvent.isComposing || event.keyCode === 229) {
            return;
        }

        event.preventDefault();
        onSubmit();
    }

    return (
        <div className="shrink-0 px-6 pb-5">
            <div className="mx-auto w-full max-w-3xl">
                <form
                    className="rounded-2xl border bg-background p-2 shadow-sm transition-colors focus-within:border-ring"
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSubmit();
                    }}
                >
                    <Textarea
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={disabled}
                        placeholder={disabled ? (disabledHint ?? '先完成配置') : '问点什么…'}
                        rows={1}
                        className="max-h-40 min-h-9 resize-none border-0 bg-transparent px-2 py-1.5 text-base shadow-none focus-visible:ring-0"
                    />

                    <div className="flex items-center justify-between px-1 pb-0.5">
                        <div className="flex items-center gap-0.5">
                            <Tooltip>
                                <TooltipTrigger
                                    render={
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-8"
                                        />
                                    }
                                >
                                    <Paperclip className="size-4" />
                                </TooltipTrigger>
                                <TooltipContent>添加文件（待接入）</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                                <TooltipTrigger
                                    render={
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-8"
                                        />
                                    }
                                >
                                    <BookOpen className="size-4" />
                                </TooltipTrigger>
                                <TooltipContent>选择知识库（待接入）</TooltipContent>
                            </Tooltip>
                        </div>

                        {busy ? (
                            <Button
                                type="button"
                                size="icon"
                                onClick={onStop}
                                aria-label="停止生成"
                                className="size-8 rounded-full bg-foreground text-background hover:bg-foreground/90"
                            >
                                <Square className="size-3 fill-current" />
                            </Button>
                        ) : (
                            <Button
                                type="submit"
                                size="icon"
                                disabled={!canSubmit}
                                aria-label="发送"
                                className="size-8 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
                            >
                                <ArrowUp className="size-4" />
                            </Button>
                        )}
                    </div>
                </form>

                <p className="mt-2 text-center text-xs text-muted-foreground">
                    {disabled
                        ? (disabledHint ?? '先完成配置再提问')
                        : 'Enter 发送 · Shift + Enter 换行 · 答案会标注出处'}
                </p>
            </div>
        </div>
    );
}
