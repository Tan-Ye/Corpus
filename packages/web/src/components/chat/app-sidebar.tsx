import { useState } from 'react';
import { ChevronDown, ChevronUp, Database, Plug, Plus, ScrollText, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { Conversation } from '@corpus/core/types';

import { ConversationList } from './conversation-list';

/** 侧栏里最多直接显示几个内置功能，多了折叠到「更多」 */
const MAX_VISIBLE_FEATURES = 3;

interface SidebarFeature {
    id: string;
    label: string;
    icon: LucideIcon;
    onClick: () => void;
}

interface AppSidebarProps {
    conversations: Conversation[];
    activeId: string;
    onSelect: (id: string) => void;
    onNew: () => void;
    onDeleteConversation: (id: string) => void;
    onOpenDatabase: () => void;
    onOpenPlugins: () => void;
    onOpenLogs: () => void;
    onOpenMcp: () => void;
    /** 对应的内置功能被关掉时，入口也要一起隐藏 */
    dbEnabled: boolean;
    logsEnabled: boolean;
    mcpEnabled: boolean;
}

export function AppSidebar({
    conversations,
    activeId,
    onSelect,
    onNew,
    onDeleteConversation,
    onOpenDatabase,
    onOpenPlugins,
    onOpenLogs,
    onOpenMcp,
    dbEnabled,
    logsEnabled,
    mcpEnabled,
}: AppSidebarProps) {
    const [expanded, setExpanded] = useState(false);

    const features: SidebarFeature[] = [
        dbEnabled && {
            id: 'db-explorer',
            label: '数据库',
            icon: Database,
            onClick: onOpenDatabase,
        },
        logsEnabled && {
            id: 'logs',
            label: '日志',
            icon: ScrollText,
            onClick: onOpenLogs,
        },
        mcpEnabled && {
            id: 'mcp-manager',
            label: 'MCP',
            icon: Plug,
            onClick: onOpenMcp,
        },
    ].filter((feature): feature is SidebarFeature => Boolean(feature));

    const visibleFeatures = expanded ? features : features.slice(0, MAX_VISIBLE_FEATURES);

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

            {/* 内置功能紧随其后，多了折叠 */}
            <div className="flex flex-col gap-0.5 px-3 pb-3">
                {visibleFeatures.map((feature) => (
                    <FeatureButton key={feature.id} feature={feature} />
                ))}

                {features.length > MAX_VISIBLE_FEATURES && (
                    <button
                        type="button"
                        onClick={() => setExpanded((current) => !current)}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                        {expanded ? (
                            <ChevronUp className="size-4" />
                        ) : (
                            <ChevronDown className="size-4" />
                        )}
                        {expanded ? '收起' : '更多'}
                    </button>
                )}
            </div>

            <Separator />

            <ConversationList
                conversations={conversations}
                activeId={activeId}
                onSelect={onSelect}
                onDelete={onDeleteConversation}
            />

            <Separator />

            <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
                <button
                    type="button"
                    onClick={onOpenPlugins}
                    className="flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:text-foreground"
                >
                    <Settings className="size-3.5" />
                    插件
                </button>
                <span className="px-1">本地</span>
            </div>
        </aside>
    );
}

function FeatureButton({ feature }: { feature: SidebarFeature }) {
    const Icon = feature.icon;

    return (
        <button
            type="button"
            onClick={feature.onClick}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
            <Icon className="size-4" />
            {feature.label}
        </button>
    );
}
