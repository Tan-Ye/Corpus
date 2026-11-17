import { useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Loader2, Plus, Trash2, X } from 'lucide-react';

import { Switch } from '@/components/common/switch';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { testMcp } from '@/services/plugins';
import type { McpManifestInput, PluginView } from '@/services/plugins';
import { cn } from '@/utils';

interface McpManagerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** 只传用户自己添加的（source === 'custom'） */
    plugins: PluginView[];
    pendingId: string;
    onToggle: (plugin: PluginView, enabled: boolean) => void;
    onAdd: (manifest: McpManifestInput) => Promise<void>;
    onRemove: (id: string) => Promise<void>;
}

interface FormState {
    id: string;
    name: string;
    description: string;
    modelHint: string;
    transport: 'http' | 'stdio';
    url: string;
    command: string;
    args: string;
    env: string;
    tools: string;
}

const EMPTY_FORM: FormState = {
    id: '',
    name: '',
    description: '',
    modelHint: '',
    transport: 'http',
    url: '',
    command: '',
    args: '',
    env: '',
    tools: '',
};

const INPUT_CLASS =
    'h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus-visible:border-ring';

/** env 文本框：一行一个 KEY=VALUE */
function parseEnvText(text: string): Record<string, string> | undefined {
    const entries = text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const at = line.indexOf('=');
            return at > 0 ? ([line.slice(0, at).trim(), line.slice(at + 1).trim()] as const) : null;
        })
        .filter((entry): entry is readonly [string, string] => entry !== null);

    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function toManifest(form: FormState): McpManifestInput {
    const tools = form.tools
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

    return {
        id: form.id.trim(),
        name: form.name.trim() || undefined,
        description: form.description.trim() || undefined,
        modelHint: form.modelHint.trim() || undefined,
        tools: tools.length > 0 ? tools : undefined,
        transport:
            form.transport === 'http'
                ? { type: 'http', url: form.url.trim() }
                : {
                      type: 'stdio',
                      command: form.command.trim(),
                      args: form.args.trim() ? form.args.trim().split(/\s+/) : undefined,
                      env: parseEnvText(form.env),
                  },
    };
}

/**
 * 解析从 README 复制的配置。
 * 支持三种形状：完整 `{ "mcpServers": { "x": {...} } }`、单个 server 对象、以及只带 url 的。
 */
function parsePastedConfig(text: string): { id?: string; form: Partial<FormState> } | null {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') {
        return null;
    }

    let data = parsed as Record<string, unknown>;
    let id: string | undefined;

    if (data.mcpServers && typeof data.mcpServers === 'object') {
        const first = Object.entries(data.mcpServers as Record<string, unknown>)[0];
        if (!first) {
            return null;
        }

        id = first[0];
        data = (first[1] ?? {}) as Record<string, unknown>;
    }

    if (typeof data.url === 'string') {
        return { id, form: { transport: 'http', url: data.url } };
    }

    if (typeof data.command === 'string') {
        const args = Array.isArray(data.args) ? data.args.map(String).join(' ') : '';
        const env =
            data.env && typeof data.env === 'object'
                ? Object.entries(data.env as Record<string, unknown>)
                      .map(([key, value]) => `${key}=${value}`)
                      .join('\n')
                : '';

        return { id, form: { transport: 'stdio', command: data.command, args, env } };
    }

    return null;
}

/**
 * 额外 MCP：用户自己接入的服务。
 * 内置插件在 plugins/ 目录里，这里只管理存进数据库的那些。
 */
export function McpManager({
    open,
    onOpenChange,
    plugins,
    pendingId,
    onToggle,
    onAdd,
    onRemove,
}: McpManagerProps) {
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [testing, setTesting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [test, setTest] = useState<{ ok: boolean; message: string; tools?: string[] } | null>(
        null,
    );
    const [error, setError] = useState('');
    const [paste, setPaste] = useState('');
    const [pasteError, setPasteError] = useState('');

    function update(patch: Partial<FormState>) {
        setForm((current) => ({ ...current, ...patch }));
        // 改了任何字段都要重新测试
        setTest(null);
        setError('');
    }

    function handlePasteFill() {
        try {
            const result = parsePastedConfig(paste);
            if (!result) {
                setPasteError('没认出配置：需要 command/args 或 url 字段');
                return;
            }

            update({ ...result.form, ...(result.id ? { id: result.id } : {}) });
            setPasteError('');
        } catch {
            setPasteError('不是合法的 JSON');
        }
    }

    async function handleTest() {
        setTesting(true);
        setTest(null);
        setError('');

        try {
            const result = await testMcp(toManifest(form));
            setTest({
                ok: true,
                message: `连接成功，${result.toolCount} 个工具`,
                tools: result.tools.map((tool) => tool.name),
            });
        } catch (err) {
            setTest({ ok: false, message: err instanceof Error ? err.message : String(err) });
        } finally {
            setTesting(false);
        }
    }

    async function handleAdd() {
        if (!test?.ok) {
            return;
        }

        setSaving(true);
        setError('');

        try {
            await onAdd(toManifest(form));
            setForm(EMPTY_FORM);
            setTest(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
                    <DialogTitle>额外 MCP</DialogTitle>
                    <button
                        type="button"
                        aria-label="关闭"
                        onClick={() => onOpenChange(false)}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                        <X className="size-4" />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-auto">
                    <section className="border-b p-4">
                        <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                            已添加（{plugins.length}）
                        </h3>

                        {plugins.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                还没有添加过。在下面填一份配置，测试通过就能加入。
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-1">
                                {plugins.map((plugin) => (
                                    <li
                                        key={plugin.id}
                                        className="flex items-center gap-2 rounded-md border px-2 py-1.5"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate text-sm">
                                                    {plugin.name}
                                                </span>
                                                {pendingId === plugin.id ? (
                                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                        <Loader2 className="size-3 animate-spin" />
                                                        {plugin.enabled
                                                            ? '正在断开…'
                                                            : '正在连接…'}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">
                                                        {plugin.enabled
                                                            ? plugin.connected
                                                                ? `${plugin.toolCount} 个工具`
                                                                : '连接失败'
                                                            : '已关闭'}
                                                    </span>
                                                )}
                                            </div>
                                            {plugin.enabled && plugin.error && (
                                                <p className="truncate text-xs text-destructive">
                                                    {plugin.error}
                                                </p>
                                            )}
                                        </div>

                                        <Switch
                                            checked={plugin.enabled}
                                            disabled={pendingId === plugin.id}
                                            label={`${plugin.enabled ? '关闭' : '开启'} ${plugin.name}`}
                                            onCheckedChange={(next) => onToggle(plugin, next)}
                                        />

                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-7"
                                            aria-label={`删除 ${plugin.name}`}
                                            onClick={() => void onRemove(plugin.id)}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className="flex flex-col gap-2 p-4">
                        <h3 className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                            <Plus className="size-3.5" />
                            添加 MCP
                        </h3>

                        <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
                            <p className="font-medium text-foreground">怎么填</p>
                            <ol className="mt-1 list-decimal space-y-1 pl-4">
                                <li>
                                    打开那个 MCP 的 README，找 <code>mcpServers</code> 那段配置，整段复制
                                    粘到下面「粘贴配置」里，点「解析并填充」。
                                </li>
                                <li>
                                    手动填也行：HTTP 服务填 <code>url</code>；本地服务填{' '}
                                    <code>command</code>（node / python / npx.cmd）和{' '}
                                    <code>args</code>（脚本或包名，空格分隔）。
                                </li>
                                <li>
                                    Windows 上 <code>npx</code> 要写成 <code>npx.cmd</code>；
                                    <code>args</code> 里的路径建议用绝对路径。
                                </li>
                                <li>
                                    需要 token 的服务，把 <code>KEY=VALUE</code> 一行一个写进 env。
                                </li>
                            </ol>
                        </div>

                        <Field label="粘贴配置（可选，支持整段 mcpServers）">
                            <textarea
                                className="h-16 w-full resize-none rounded-md border bg-background p-2 font-mono text-xs outline-none focus-visible:border-ring"
                                value={paste}
                                onChange={(event) => setPaste(event.target.value)}
                                placeholder='{"mcpServers":{"filesystem":{"command":"npx.cmd","args":["-y","@modelcontextprotocol/server-filesystem","D:\\\\docs"]}}}'
                            />
                        </Field>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!paste.trim()}
                                onClick={handlePasteFill}
                            >
                                解析并填充
                            </Button>
                            {pasteError && (
                                <span className="text-xs text-destructive">{pasteError}</span>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <Field label="id（必填，唯一）">
                                <input
                                    className={INPUT_CLASS}
                                    value={form.id}
                                    onChange={(event) => update({ id: event.target.value })}
                                    placeholder="my-mcp"
                                />
                            </Field>
                            <Field label="名称">
                                <input
                                    className={INPUT_CLASS}
                                    value={form.name}
                                    onChange={(event) => update({ name: event.target.value })}
                                    placeholder="我的 MCP"
                                />
                            </Field>
                        </div>

                        <Field label="描述">
                            <input
                                className={INPUT_CLASS}
                                value={form.description}
                                onChange={(event) =>
                                    update({ description: event.target.value })
                                }
                                placeholder="这个服务能查什么"
                            />
                        </Field>

                        <Field label="模型提示（会写进系统提示词，告诉模型什么时候用它）">
                            <input
                                className={INPUT_CLASS}
                                value={form.modelHint}
                                onChange={(event) => update({ modelHint: event.target.value })}
                                placeholder="查 XX 文档时用这个"
                            />
                        </Field>

                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">传输</span>
                            {(['http', 'stdio'] as const).map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => update({ transport: item })}
                                    className={cn(
                                        'rounded-md px-2 py-1 text-xs',
                                        form.transport === item
                                            ? 'bg-accent text-foreground'
                                            : 'text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>

                        {form.transport === 'http' ? (
                            <Field label="url">
                                <input
                                    className={INPUT_CLASS}
                                    value={form.url}
                                    onChange={(event) => update({ url: event.target.value })}
                                    placeholder="https://example.com/mcp"
                                />
                            </Field>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 gap-2">
                                    <Field label="command（可执行程序）">
                                        <input
                                            className={INPUT_CLASS}
                                            value={form.command}
                                            onChange={(event) =>
                                                update({ command: event.target.value })
                                            }
                                            placeholder="node"
                                        />
                                    </Field>
                                    <Field label="args（参数，空格分隔）">
                                        <input
                                            className={INPUT_CLASS}
                                            value={form.args}
                                            onChange={(event) => update({ args: event.target.value })}
                                            placeholder="D:\\mcp\\server.mjs"
                                        />
                                    </Field>
                                </div>

                                <Field label="env（一行一个 KEY=VALUE，可选）">
                                    <textarea
                                        className="h-16 w-full resize-none rounded-md border bg-background p-2 font-mono text-xs outline-none focus-visible:border-ring"
                                        value={form.env}
                                        onChange={(event) => update({ env: event.target.value })}
                                        placeholder="API_KEY=xxxx"
                                    />
                                </Field>
                            </>
                        )}

                        <Field label="工具白名单（逗号分隔，留空表示全部）">
                            <input
                                className={INPUT_CLASS}
                                value={form.tools}
                                onChange={(event) => update({ tools: event.target.value })}
                                placeholder="search, fetch"
                            />
                        </Field>

                        {test && (
                            <div className="flex flex-col gap-0.5">
                                <p
                                    className={cn(
                                        'flex items-center gap-1 text-xs',
                                        test.ok ? 'text-muted-foreground' : 'text-destructive',
                                    )}
                                >
                                    {test.ok ? (
                                        <Check className="size-3.5" />
                                    ) : (
                                        <X className="size-3.5" />
                                    )}
                                    {test.message}
                                </p>

                                {test.tools && test.tools.length > 0 && (
                                    <p className="truncate font-mono text-[11px] text-muted-foreground/70">
                                        {test.tools.join(' · ')}
                                    </p>
                                )}
                            </div>
                        )}

                        {error && <p className="text-xs text-destructive">{error}</p>}

                        <div className="mt-1 flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={testing || !form.id.trim()}
                                onClick={() => void handleTest()}
                            >
                                {testing && <Loader2 className="size-3.5 animate-spin" />}
                                测试连接
                            </Button>
                            <Button
                                size="sm"
                                disabled={!test?.ok || saving}
                                onClick={() => void handleAdd()}
                            >
                                添加
                            </Button>
                        </div>
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{label}</span>
            {children}
        </label>
    );
}
