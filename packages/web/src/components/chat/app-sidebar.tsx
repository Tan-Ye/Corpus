import { Plus, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { Conversation } from '@corpus/core/types';

import { ConversationList } from './conversation-list';

interface AppSidebarProps {
    conversations: Conversation[];
    activeId: string;
    onSelect: (id: string) => void;
    onNew: () => void;
}

export function AppSidebar({ conversations, activeId, onSelect, onNew }: AppSidebarProps) {
    return (
        <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
            <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
                <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
                    C
                </div>
                <span className="text-sm font-semibold tracking-tight">Corpus</span>
            </div>

            <div className="px-3 pb-2">
                <Button
                    variant="outline"
                    className="w-full justify-start gap-2 bg-background font-normal"
                    onClick={onNew}
                >
                    <Plus className="size-4" />
                    新建对话
                </Button>
            </div>

            <ConversationList
                conversations={conversations}
                activeId={activeId}
                onSelect={onSelect}
            />

            <Separator />

            <div className="flex items-center justify-between px-4 py-3 text-xs text-muted-foreground">
                <button
                    type="button"
                    className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:text-foreground"
                >
                    <Settings className="size-3.5" />
                    设置
                </button>
                <span>本地</span>
            </div>
        </aside>
    );
}
