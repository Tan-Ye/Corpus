import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { appendFileSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

/**
 * Corpus 的 Electron 主进程。
 *
 * 设计要点：
 * 1. 数据目录放在 %LOCALAPPDATA%\Corpus —— 不用 Electron 默认的 userData（那是 %APPDATA%），
 *    否则又会撞上「普通用户写不了」的老问题。
 * 2. server 在同一个进程里跑：窗口关掉进程就没了，不会留后台服务。
 * 3. 端口固定 8787，和开发环境、便携版保持一致。
 */
const here = fileURLToPath(new URL('.', import.meta.url));
const isDev = !app.isPackaged;

/**
 * 关掉 Chromium 沙箱。
 *
 * 这台开发机上 Chromium 的 sandbox 初始化直接崩（裸跑 electron.exe 就退出码
 * 0x80000003），加 --no-sandbox 才能起窗口。应用只加载本地 127.0.0.1 的页面、
 * 不加载外部内容，因此这里的取舍是可接受的；打包时同样保留这个开关。
 */
app.commandLine.appendSwitch('no-sandbox');

function isWritableDir(dir) {
    try {
        mkdirSync(dir, { recursive: true });

        const probe = join(dir, '.corpus-write-test');
        writeFileSync(probe, 'ok');
        unlinkSync(probe);
        return true;
    } catch {
        return false;
    }
}

/**
 * 数据目录：**程序目录旁的 data/**。
 *
 * 这是刻意的取舍：AppData 在部分机器上会被安全软件/策略挡住（开发者本机就撞过），
 * 而程序目录用户自己可见、可备份、可删除，和便携版语义一致。
 *
 * - 发布版：<安装目录>/data
 * - 开发态：<仓库>/.tmp/electron-data（避免和 `pnpm dev` 的 data/ 抢同一个库）
 * - 程序目录不可写（比如装在 Program Files）时，回退到 %LOCALAPPDATA%\Corpus
 * - CORPUS_DATA_DIR 可强制指定
 */
function resolveDataDir() {
    const explicit = process.env.CORPUS_DATA_DIR?.trim();

    if (explicit) {
        return explicit;
    }

    const appRoot = isDev ? join(here, '..', '..') : dirname(process.execPath);
    const preferred = isDev ? join(appRoot, '.tmp', 'electron-data') : join(appRoot, 'data');

    if (isWritableDir(preferred)) {
        return preferred;
    }

    const fallbackBase = process.env.LOCALAPPDATA ?? process.env.APPDATA ?? process.cwd();
    return join(fallbackBase, 'Corpus');
}

const dataDir = resolveDataDir();
mkdirSync(dataDir, { recursive: true });
app.setPath('userData', dataDir);

process.env.CORPUS_DB = join(dataDir, 'corpus.db');
process.env.PORT = '8787';

// 资源目录：开发态是仓库根（下面有 prompts/ 和 plugins/），打包后是 resources
process.env.CORPUS_RESOURCES_DIR = isDev
    ? join(here, '..', '..')
    : join(process.resourcesPath, 'resources');

process.env.CORPUS_WEB_DIR = isDev
    ? join(here, '..', '..', 'packages', 'web', 'dist')
    : join(process.resourcesPath, 'web');

/** 开发态可以指到 Vite（5173），默认走 server 同源托管 */
const appUrl = process.env.CORPUS_APP_URL ?? 'http://127.0.0.1:8787/';

/** 打包态读安装包版本；开发态 app.getVersion() 返回的是 Electron 版本，不能直接用 */
function currentVersion() {
    if (!isDev) {
        return app.getVersion();
    }

    try {
        const pkg = JSON.parse(readFileSync(join(here, '..', '..', 'package.json'), 'utf8'));
        return String(pkg.version ?? '0.0.0');
    } catch {
        return app.getVersion();
    }
}

/** 逐段比较版本号（1.2.3 > 1.2.0），足够判断「有没有新版本」 */
function compareVersions(a, b) {
    const pa = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
    const pb = b.split('.').map((part) => Number.parseInt(part, 10) || 0);

    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);

        if (diff !== 0) {
            return diff;
        }
    }

    return 0;
}

const RELEASE_API = 'https://api.github.com/repos/Tan-Ye/Corpus/releases/latest';

/**
 * 查 GitHub Releases 最新版。
 * status：update（有新版本）/ latest（已是最新）/ error（查不了，附中文原因）。
 * 网络失败不抛异常——界面要显示「检查失败」，而不是弹崩溃框。
 */
async function checkUpdate() {
    const current = currentVersion();

    try {
        const res = await fetch(RELEASE_API, {
            headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': 'Corpus',
            },
        });

        if (res.status === 404) {
            return { status: 'error', current, error: 'GitHub 上还没有发布过版本。' };
        }

        if (!res.ok) {
            return { status: 'error', current, error: `更新服务返回 ${res.status}，稍后再试。` };
        }

        const data = await res.json();
        const latest = String(data.tag_name ?? '').replace(/^v/i, '').trim();

        if (!latest) {
            return { status: 'error', current, error: '更新信息里没有版本号。' };
        }

        return {
            status: compareVersions(latest, current) > 0 ? 'update' : 'latest',
            current,
            latest,
            url: typeof data.html_url === 'string' ? data.html_url : '',
            notes: typeof data.body === 'string' ? data.body.slice(0, 2000) : '',
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { status: 'error', current, error: `连不上 GitHub：${message}` };
    }
}

ipcMain.handle('corpus:app-info', () => ({
    version: currentVersion(),
    isDev,
    platform: process.platform,
}));
ipcMain.handle('corpus:check-update', checkUpdate);

let mainWindow = null;

async function waitForServer(timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            const res = await fetch('http://127.0.0.1:8787/api/healthz');

            if (res.ok) {
                return true;
            }
        } catch {
            // 还在启动
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return false;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 840,
        minWidth: 960,
        minHeight: 640,
        title: 'Corpus',
        backgroundColor: '#ffffff',
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            // preload 只暴露「版本 / 检查更新」两个只读能力（见 preload.cjs）
            preload: join(here, 'preload.cjs'),
        },
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    return mainWindow.loadURL(appUrl);
}

async function bootstrap() {
    try {
        // 打包后 server.mjs 在 resources 根目录；开发态可以用 CORPUS_SERVER_ENTRY 指向
        // `scripts/build-package.mjs` 产出的 server.mjs，用来验证 Electron 内置 Node 能跑它
        const serverEntry =
            process.env.CORPUS_SERVER_ENTRY ??
            (isDev ? null : join(process.resourcesPath, 'server.mjs'));

        if (serverEntry) {
            console.log('[shell] 加载 server：', serverEntry);
            await import(pathToFileURL(serverEntry).href);
        }

        const ready = await waitForServer();

        if (!ready) {
            showFailure('本地服务没有在 20 秒内就绪。', '端口 8787 被占用，或数据库文件不可写。');
            return;
        }

        await createWindow();
    } catch (error) {
        // GUI 程序的异常不会出现在终端里，必须写到文件 + 弹窗，否则就是"闪一下就没了"
        const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
        console.error('[shell] 启动失败：', detail);
        writeStartupLog(detail);
        showFailure('主进程启动失败。', detail);
    }
}

function writeStartupLog(text) {
    try {
        appendFileSync(join(dataDir, 'shell-error.log'), `[${new Date().toISOString()}] ${text}\n`);
    } catch {
        // 写不了日志就只靠弹窗
    }
}

function showFailure(title, detail) {
    try {
        dialog.showErrorBox(
            `Corpus 启动失败：${title}`,
            `${detail}\n\n数据目录：${dataDir}\n日志：${join(dataDir, 'shell-error.log')}`,
        );
    } catch {
        // ignore
    }

    app.quit();
}

// 单实例：第二次双击时把已有窗口叫到前面
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.focus();
        }
    });

    app.whenReady().then(bootstrap);

    app.on('window-all-closed', () => {
        app.quit();

        // server 与主进程同进程：正常退出会释放 8787 与 SQLite 句柄，
        // 但只要有一个挂住的句柄，app.quit() 就会停在「窗口已关、进程还在」的状态。
        // 这种残影会锁住安装目录里的文件，下次装新版本时 NSIS 报「不能打开要写入的文件」。
        const forceExit = setTimeout(() => app.exit(0), 2000);
        forceExit.unref();
    });
}
