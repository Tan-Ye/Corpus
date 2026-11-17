import { useCallback, useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface DrawerWidthOptions {
    /** 初始宽度占屏幕比例 */
    initialRatio?: number;
    minRatio?: number;
    maxRatio?: number;
}

/**
 * 右侧抽屉的宽度 + 拖拽调整。
 *
 * 用 pointer capture 而不是全局监听：拖到抽屉外面也不会丢事件，松手一定能收尾。
 * 宽度按窗口比例夹住：默认 1/3，最少 1/3，最多 90%。
 */
export function useDrawerWidth({
    initialRatio = 1 / 3,
    minRatio = 1 / 3,
    maxRatio = 0.9,
}: DrawerWidthOptions = {}) {
    const clamp = useCallback(
        (value: number) =>
            Math.round(
                Math.min(
                    Math.max(value, window.innerWidth * minRatio),
                    window.innerWidth * maxRatio,
                ),
            ),
        [minRatio, maxRatio],
    );

    const [width, setWidth] = useState(() => clamp(window.innerWidth * initialRatio));
    const [resizing, setResizing] = useState(false);

    // 窗口变化时重新夹一次，避免拖到一个宽度后换分辨率就跑出屏幕
    useEffect(() => {
        const handleWindowResize = () => setWidth((current) => clamp(current));
        window.addEventListener('resize', handleWindowResize);
        return () => window.removeEventListener('resize', handleWindowResize);
    }, [clamp]);

    const startResize = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            event.preventDefault();
            const handle = event.currentTarget;
            const startX = event.clientX;
            const startWidth = width;

            handle.setPointerCapture(event.pointerId);
            setResizing(true);

            function handleMove(moveEvent: PointerEvent) {
                // 拖的是左边缘：鼠标左移 = 抽屉变宽
                setWidth(clamp(startWidth + (startX - moveEvent.clientX)));
            }

            function handleUp(upEvent: PointerEvent) {
                handle.releasePointerCapture(upEvent.pointerId);
                handle.removeEventListener('pointermove', handleMove);
                handle.removeEventListener('pointerup', handleUp);
                handle.removeEventListener('pointercancel', handleUp);
                setResizing(false);
            }

            handle.addEventListener('pointermove', handleMove);
            handle.addEventListener('pointerup', handleUp);
            handle.addEventListener('pointercancel', handleUp);
        },
        [clamp, width],
    );

    return { width, resizing, startResize };
}
