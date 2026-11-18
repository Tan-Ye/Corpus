/**
 * 开发态编排。
 *
 *   pnpm dev      只起后端（8787）+ 前端（5173），浏览器里开发
 *   pnpm dev-el   在上面基础上再打开 Electron 窗口（窗口加载 Vite 的 5173）
 *
 * 统一关停：Ctrl+C 或关掉 Electron 窗口都会把其余进程一起收掉。
 */
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const withElectron = process.argv.includes('--electron');
const electronExe = join(
    repoRoot,
    'node_modules',
    'electron',
    'dist',
    process.platform === 'win32' ? 'electron.exe' : 'electron',
);

const children = [];
let shuttingDown = false;

function run(label, command, args) {
    console.log(`[dev] 启动 ${label}：${command} ${args.join(' ')}`);

    const child = spawn(command, args, {
        cwd: repoRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32',
    });

    children.push(child);

    child.on('exit', (code) => {
        if (!shuttingDown && code !== 0 && code !== null) {
            console.error(`[dev] ${label} 退出，代码 ${code}`);
        }
    });

    return child;
}

/** Windows 上 child.kill() 只杀直接子进程；pnpm 经 cmd 起的 node 树会变成孤儿 */
function killTree(pid) {
    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
        return;
    }

    try {
        process.kill(-pid, 'SIGKILL');
    } catch {
        // 已经退出
    }
}

async function shutdown(exitCode = 0) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    for (const child of children) {
        if (child.pid) {
            killTree(child.pid);
        }
    }

    // 给 taskkill 一点时间收尾；父进程先退的话，子进程照样会残留
    await new Promise((resolve) => setTimeout(resolve, 300));
    process.exit(exitCode);
}

/** 在端口区间里找一个已经能响应的（127.0.0.1 与 localhost 都试，兼容只绑 IPv6 的 Vite） */
async function findReadyPort(start, end, path) {
    for (let port = start; port <= end; port += 1) {
        for (const host of ['127.0.0.1', 'localhost']) {
            try {
                const res = await fetch(`http://${host}:${port}${path}`, {
                    signal: AbortSignal.timeout(800),
                });

                if (res.ok) {
                    return port;
                }
            } catch {
                // 这个 host/端口还没起来
            }
        }
    }

    return null;
}

/**
 * 等某个服务就绪，返回它实际用的端口。
 *
 * 不写死端口：5173 被占时 Vite 会自动换到 5174，写死就会一直等下去。
 */
async function waitForPort(start, end, path, label, timeoutMs = 90_000) {
    const deadline = Date.now() + timeoutMs;
    let lastNotice = 0;

    while (Date.now() < deadline) {
        const port = await findReadyPort(start, end, path);

        if (port) {
            console.log(`[dev] ${label} 就绪：http://127.0.0.1:${port}`);
            return port;
        }

        if (Date.now() - lastNotice > 5000) {
            console.log(`[dev] 等待 ${label}…（扫描 ${start}-${end}）`);
            lastNotice = Date.now();
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(
        `${label} 在 ${timeoutMs / 1000} 秒内没有就绪（扫描 ${start}-${end}）\n` +
            '常见原因：进程启动失败、端口被占用、数据库不可写（看后端输出的 [startup] 行）',
    );
}

async function main() {
    run('后端', 'pnpm', ['--filter', '@corpus/server', 'dev']);
    run('前端', 'pnpm', ['--filter', '@corpus/web', 'dev']);

    // 只等前端：Vite 能响应就足以打开窗口。
    // 后端还在初始化、MCP 还在连，都不该拦住窗口出现——界面会自己重试 API。
    const webPort = await waitForPort(5173, 5185, '/', '前端');

    if (!withElectron) {
        console.log(`[dev] 前端已就绪，浏览器打开 http://localhost:${webPort}/`);
        console.log('[dev] 想同时开 Electron 窗口，用 pnpm dev-el');
        return;
    }

    // 窗口加载 Vite 的地址，API 由 Vite 代理到后端
    process.env.CORPUS_APP_URL = `http://localhost:${webPort}`;
    delete process.env.CORPUS_SERVER_ENTRY;

    console.log(`[dev] 启动 Electron：${electronExe}`);

    const electron = spawn(electronExe, ['--no-sandbox', join(repoRoot, 'packages', 'shell')], {
        cwd: repoRoot,
        stdio: 'inherit',
        env: process.env,
    });

    children.push(electron);

    electron.on('error', (error) => {
        console.error('[dev] Electron 启动失败：', error.message);
    });

    electron.on('exit', (code) => {
        console.log(`[dev] Electron 退出（${code}），关闭前后端`);
        shutdown(0);
    });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

main().catch((error) => {
    console.error('[dev] 启动失败：', error instanceof Error ? error.message : error);
    shutdown(1);
});
