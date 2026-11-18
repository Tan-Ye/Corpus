/**
 * 便携版启动器（包根，与 server.mjs 同级）。
 *
 * 固定端口 8787。启动前把占着它的旧 Corpus 实例清掉，
 * 这样「关窗口 = 关服务」才成立：窗口里的进程就是唯一的服务进程。
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const logFile = join(root, 'startup.log');
const portFile = join(root, '.port');

/** 固定端口：不再自动往后找，避免"旧实例在 8788、新实例在 8787"两个进程抢数据库 */
const PORT = 8787;

/** 清理旧实例时扫描的范围（历史版本自动回退可能落在 8788~8807） */
const SCAN_MAX = 8807;

function log(message) {
    console.log(message);
    try {
        appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
    } catch {
        // 日志写不了不影响启动，控制台还有输出
    }
}

function isPortBusy(port) {
    return new Promise((resolve) => {
        const server = createServer();

        server.once('error', () => resolve(true));
        server.once('listening', () => {
            server.close(() => resolve(false));
        });

        server.listen(port, '127.0.0.1');
    });
}

/** 用接口形状认人：别的程序不会返回 configured/source */
async function isCorpus(port) {
    try {
        const res = await fetch(`http://127.0.0.1:${port}/api/settings/llm`, {
            signal: AbortSignal.timeout(500),
        });

        if (!res.ok) {
            return false;
        }

        const data = await res.json();
        return typeof data?.configured === 'boolean' && typeof data?.source === 'string';
    } catch {
        return false;
    }
}

function findListenerPid(port) {
    const result = spawnSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true });

    if (result.status !== 0 || !result.stdout) {
        return null;
    }

    const pattern = new RegExp(`:${port}\\s`);

    for (const line of result.stdout.split(/\r?\n/)) {
        if (!line.includes('LISTENING') || !pattern.test(line)) {
            continue;
        }

        const pid = Number(line.trim().split(/\s+/).at(-1));

        if (pid > 0) {
            return pid;
        }
    }

    return null;
}

function isNodeProcess(pid) {
    const result = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
        encoding: 'utf8',
        windowsHide: true,
    });

    return /node\.exe/i.test(result.stdout ?? '');
}

function killPid(pid) {
    const result = spawnSync('taskkill', ['/F', '/PID', String(pid)], {
        encoding: 'utf8',
        windowsHide: true,
    });

    return result.status === 0;
}

/**
 * 直接按命令行找残留的 Corpus 进程（launcher.mjs / server.mjs）。
 *
 * 比端口探测可靠：进程卡死、HTTP 不响应、或者停在 8788 这类旧端口时，
 * 端口探测认不出来，但它照样占着数据库。
 */
function findCorpusPids() {
    const command =
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | " +
        "Where-Object { $_.CommandLine -match 'launcher\\.mjs|server\\.mjs' } | " +
        'Select-Object -ExpandProperty ProcessId';

    const result = spawnSync(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', command],
        { encoding: 'utf8', windowsHide: true },
    );

    if (result.status !== 0 || !result.stdout) {
        return [];
    }

    return result.stdout
        .split(/\r?\n/)
        .map((line) => Number(line.trim()))
        .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}

/** 先清进程，再清端口：卡死的实例不响应 HTTP，只能靠命令行认出来 */
function killResidualProcesses() {
    const pids = findCorpusPids();

    for (const pid of pids) {
        log(`结束残留的 Corpus 进程（PID ${pid}）…`);

        if (!killPid(pid)) {
            log(`结束失败（PID ${pid}），继续尝试按端口清理。`);
        }
    }

    return pids.length;
}

async function waitPortFree(port) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));

        if (!(await isPortBusy(port))) {
            return true;
        }
    }

    return false;
}

/**
 * 把旧实例清掉，保证 8787 只有一个主人。
 *
 * 扫描范围要覆盖 8788~8807：历史版本会自动往后找端口，
 * 那些进程还占着数据库，不清掉的话新实例启动时写不进库。
 */
async function cleanOldInstances() {
    const stale = [];

    for (let port = PORT; port <= SCAN_MAX; port += 1) {
        if (!(await isPortBusy(port))) {
            continue;
        }

        if (await isCorpus(port)) {
            const pid = findListenerPid(port);

            if (pid) {
                stale.push({ port, pid });
            }
        }
    }

    for (const item of stale) {
        log(`发现旧 Corpus 实例占用端口 ${item.port}（PID ${item.pid}），正在结束它…`);

        if (!killPid(item.pid)) {
            log(`结束进程失败（PID ${item.pid}）：权限不足，请手动在任务管理器结束它。`);
            return false;
        }
    }

    if (stale.length > 0 && !(await waitPortFree(PORT))) {
        log(`端口 ${PORT} 仍被占用，启动中止。`);
        return false;
    }

    if (await isPortBusy(PORT)) {
        const pid = findListenerPid(PORT);

        if (pid && isNodeProcess(pid)) {
            log(`端口 ${PORT} 被一个 node 进程占用（PID ${pid}），正在结束它…`);

            if (!killPid(pid) || !(await waitPortFree(PORT))) {
                log(`端口 ${PORT} 清理失败，请手动结束 PID ${pid}。`);
                return false;
            }
        } else {
            log(
                `端口 ${PORT} 被其他程序占用` +
                    (pid ? `（PID ${pid}）` : '') +
                    '。为避免误关别的程序，这里不动它：请先关闭它，或改 CORPUS_PORT 启动。',
            );
            return false;
        }
    }

    return true;
}

async function waitForPort() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
        try {
            const value = Number(readFileSync(portFile, 'utf8').trim());

            if (value > 0) {
                return value;
            }
        } catch {
            // 还没写
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return null;
}

async function waitUntilReady(port) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/api/healthz`);

            if (res.ok) {
                return true;
            }
        } catch {
            // 还在启动
        }

        await new Promise((resolve) => setTimeout(resolve, 300));
    }

    return false;
}

function openBrowser(url) {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
}

async function main() {
    log('Corpus 启动中…');

    // 先按进程清：旧实例可能卡死或停在旧端口，端口探测认不出来，但它占着数据库
    const killed = killResidualProcesses();

    if (killed > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (!(await cleanOldInstances())) {
        process.exitCode = 1;
        return;
    }

    rmSync(portFile, { force: true });

    // 便携版的数据放在程序目录的 data/ 下：整个文件夹拷走就等于连数据一起搬走。
    // 程序目录不可写时（比如解压到 Program Files），server 会自动退到 %LOCALAPPDATA%\Corpus。
    if (!process.env.CORPUS_DB) {
        process.env.CORPUS_DB = join(root, 'data', 'corpus.db');
    }

    process.env.PORT = String(PORT);
    process.env.CORPUS_PORT_FILE = portFile;
    process.env.CORPUS_WEB_DIR = join(root, 'web');
    process.env.CORPUS_RESOURCES_DIR = join(root, 'resources');

    log(`数据库：${process.env.CORPUS_DB}`);

    await import('./server.mjs');

    const port = await waitForPort();

    if (!port) {
        log('服务 20 秒内没有写出端口，请看上面的错误信息');
        return;
    }

    if (await waitUntilReady(port)) {
        log(`服务就绪 → http://127.0.0.1:${port}/`);

        if (process.env.CORPUS_NO_BROWSER !== '1') {
            openBrowser(`http://127.0.0.1:${port}/`);
        }
    } else {
        log(`服务在 ${port} 端口上 18 秒内没有响应，请查看上面的错误信息`);
    }
}

// 关窗口、Ctrl+C 时把进程收干净，别留后台服务
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
    process.on(signal, () => {
        log(`收到 ${signal}，退出`);
        process.exit(0);
    });
}

main().catch((error) => {
    log(`启动失败：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
