import { cn } from '@/utils';

interface SwitchProps {
    checked: boolean;
    disabled?: boolean;
    /** 无障碍标签，读屏用 */
    label: string;
    onCheckedChange: (checked: boolean) => void;
}

/**
 * 极简开关。没用 shadcn 的 switch：那个要多装一套依赖，
 * 这里只需要一个 role="switch" 的按钮，键盘和读屏都能正常工作。
 */
export function Switch({ checked, disabled, label, onCheckedChange }: SwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onCheckedChange(!checked)}
            className={cn(
                'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
                checked ? 'bg-brand' : 'bg-muted-foreground/30',
                disabled && 'cursor-not-allowed opacity-50',
            )}
        >
            <span
                className={cn(
                    'inline-block size-4 rounded-full bg-background shadow-sm transition-transform',
                    checked ? 'translate-x-4.5' : 'translate-x-0.5',
                )}
            />
        </button>
    );
}
