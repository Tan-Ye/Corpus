import { useState } from 'react';
import { Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { saveLLMConfig } from '@/services/settings';
import type { LLMConfigView } from '@/services/settings';

interface LLMSettingsDialogProps {
    open: boolean;
    /** 当前生效的配置；null 表示还没拉到 */
    config: LLMConfigView | null;
    onClose: () => void;
    onSaved: (config: LLMConfigView) => void;
}

const INPUT_CLASS =
    'h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring';

/**
 * 模型配置。
 *
 * .env 只是开发环境的兜底，生产环境不读它——用户必须在这里填一次。
 * apiKey 存库后不再回显，留空表示沿用已保存的那把。
 */
export function LLMSettingsDialog({ open, config, onClose, onSaved }: LLMSettingsDialogProps) {
    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="flex flex-col">
                {/* key 跟着 open 变，每次打开都是新挂载：表单初值直接取 config，
                    不用在 effect 里 setState（那样等于多渲染一轮，也容易把用户输入冲掉） */}
                <LLMConfigForm
                    key={String(open)}
                    config={config}
                    onClose={onClose}
                    onSaved={onSaved}
                />
            </DialogContent>
        </Dialog>
    );
}

interface LLMConfigFormProps {
    config: LLMConfigView | null;
    onClose: () => void;
    onSaved: (config: LLMConfigView) => void;
}

function LLMConfigForm({ config, onClose, onSaved }: LLMConfigFormProps) {
    const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? '');
    const [model, setModel] = useState(config?.model ?? '');
    const [apiKey, setApiKey] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    async function handleSave() {
        setSaving(true);
        setError('');
        setMessage('');

        try {
            const saved = await saveLLMConfig({
                baseUrl,
                model,
                apiKey: apiKey.trim() || undefined,
            });

            onSaved(saved);
            setApiKey('');
            setMessage(`已保存，当前模型：${saved.model}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
                <DialogTitle className="text-sm">模型配置</DialogTitle>
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
                <p className="text-sm leading-6 text-muted-foreground">
                    只支持 OpenAI 兼容接口（<code>POST /chat/completions</code>）。保存后立即生效，不用重启。
                    <br />
                    开发环境的 <code>.env</code> 只是兜底；生产环境不读它，模型只能在这里配。
                </p>

                <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium">服务地址</span>
                    <input
                        className={INPUT_CLASS}
                        value={baseUrl}
                        onChange={(event) => setBaseUrl(event.target.value)}
                        placeholder="https://api.deepseek.com/v1"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <span className="text-xs text-muted-foreground">
                        末尾不要带斜杠；版本前缀按 provider 文档写。
                    </span>
                </label>

                <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium">模型名</span>
                    <input
                        className={INPUT_CLASS}
                        value={model}
                        onChange={(event) => setModel(event.target.value)}
                        placeholder="deepseek-chat"
                        autoComplete="off"
                        spellCheck={false}
                    />
                </label>

                <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium">API Key</span>
                    <input
                        className={INPUT_CLASS}
                        type="password"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        placeholder={config?.hasApiKey ? '已保存，留空表示不修改' : 'sk-...'}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <span className="text-xs text-muted-foreground">
                        存在本机数据库里，不会回显，也不会写进日志。
                    </span>
                </label>

                {config?.source === 'env' && (
                    <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                        当前用的是 .env 里的配置。在这里保存后会覆盖它。
                    </p>
                )}

                {message && (
                    <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                        {message}
                    </p>
                )}

                {error && (
                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {error}
                    </p>
                )}
            </div>

            <footer className="flex shrink-0 items-center justify-end gap-2 border-t px-4 py-2">
                <Button variant="ghost" size="sm" onClick={onClose}>
                    关闭
                </Button>
                <Button
                    size="sm"
                    disabled={saving || !baseUrl.trim() || !model.trim()}
                    onClick={() => void handleSave()}
                >
                    {saving && <Loader2 className="size-3.5 animate-spin" />}
                    保存
                </Button>
            </footer>
        </>
    );
}
