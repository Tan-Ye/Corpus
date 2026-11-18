import { Moon, PanelLeft, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Theme } from '@/hooks';
import { cn } from '@/utils';

interface ChatHeaderProps {
    title: string;
    model: string;
    /** 没配置模型时徽章用警示色，点它去设置 */
    modelConfigured: boolean;
    theme: Theme;
    onToggleTheme: () => void;
    onOpenSidebar: () => void;
    onOpenSettings: () => void;
}

export function ChatHeader({
    title,
    model,
    modelConfigured,
    theme,
    onToggleTheme,
    onOpenSidebar,
    onOpenSettings,
}: ChatHeaderProps) {
    const nextLabel = theme === 'dark' ? '切换到浅色' : '切换到深色';

    return (
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 md:px-5">
            <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={onOpenSidebar}
                aria-label="打开会话列表"
            >
                <PanelLeft className="size-4" />
            </Button>

            <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h1>

            <button
                type="button"
                onClick={onOpenSettings}
                title={modelConfigured ? `模型：${model}（点击修改）` : '还没有配置模型，点这里填写'}
                className={cn(
                    'hidden shrink-0 rounded-md border px-2 py-0.5 text-xs transition-colors sm:inline-block',
                    modelConfigured
                        ? 'text-muted-foreground hover:text-foreground'
                        : 'border-destructive/40 text-destructive hover:bg-destructive/10',
                )}
            >
                {model}
            </button>

            <Tooltip>
                <TooltipTrigger
                    render={
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onToggleTheme}
                            aria-label={nextLabel}
                            className="shrink-0"
                        />
                    }
                >
                    {theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
                </TooltipTrigger>
                <TooltipContent>{nextLabel}</TooltipContent>
            </Tooltip>
        </header>
    );
}
