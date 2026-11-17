import { Loader2, Puzzle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/common/switch';
import type { PluginView } from '@/services/plugins';

interface PluginPanelProps {
    plugins: PluginView[];
    /** 正在切换的插件 id，用来禁用它的开关 */
    pendingId: string;
    error: string;
    onToggle: (plugin: PluginView, enabled: boolean) => void;
    /** 打开「额外 MCP」弹窗 */
    onOpenMcp: () => void;
}

/**
 * 插件面板：列表 + 开关。
 * 状态由页面持有，切换后服务端返回最新状态，避免两处各自拉数据不同步。
 */
export function PluginPanel({ plugins, pendingId, error, onToggle, onOpenMcp }: PluginPanelProps) {
    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
                <Puzzle className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-medium">插件</h2>
                <span className="text-xs text-muted-foreground">{plugins.length} 个</span>
            </header>

            {error && (
                <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
                    {error}
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto">
                {plugins.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">
                        没有找到插件。把插件放进仓库的 plugins/ 目录，每个目录一个 manifest.json。
                    </p>
                ) : (
                    plugins.map((plugin) => (
                        <div
                            key={plugin.id}
                            className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{plugin.name}</span>
                                    <Status
                                        plugin={plugin}
                                        pending={pendingId === plugin.id}
                                    />
                                </div>

                                {plugin.description && (
                                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                                        {plugin.description}
                                    </p>
                                )}

                                {plugin.enabled && plugin.error && (
                                    <p className="mt-1 text-xs text-destructive">{plugin.error}</p>
                                )}
                            </div>

                            <Switch
                                checked={plugin.enabled}
                                disabled={pendingId === plugin.id}
                                label={`${plugin.enabled ? '关闭' : '开启'} ${plugin.name}`}
                                onCheckedChange={(next) => onToggle(plugin, next)}
                            />
                        </div>
                    ))
                )}
            </div>

            <footer className="flex shrink-0 items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
                <span className="min-w-0 flex-1">
                    开关由服务端执行：开启会立即连接，关闭会断开并撤掉它的工具。
                </span>
                <Button variant="outline" size="sm" onClick={onOpenMcp}>
                    添加 MCP
                </Button>
            </footer>
        </div>
    );
}

function Status({ plugin, pending }: { plugin: PluginView; pending: boolean }) {
    // 切换中：连接可能要等十几秒，必须让用户看到在动
    if (pending) {
        return (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                {plugin.enabled ? '正在断开…' : '正在连接…'}
            </span>
        );
    }

    if (!plugin.enabled) {
        return <span className="text-xs text-muted-foreground">已关闭</span>;
    }

    if (plugin.kind === 'builtin') {
        return <span className="text-xs text-muted-foreground">已开启</span>;
    }

    if (!plugin.connected) {
        return <span className="text-xs text-destructive">连接失败</span>;
    }

    return <span className="text-xs text-muted-foreground">已连接 · {plugin.toolCount} 个工具</span>;
}
