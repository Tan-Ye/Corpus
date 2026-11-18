import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrations } from './migrations';

/**
 * 自己加载一次 .env。
 *
 * 不能指望 env.ts：ESM 按 import 图求值，db 可能先于 env.ts 执行，
 * 那样 .env 里的 CORPUS_DB 不生效，用户改配置却仍然连到默认库。
 * loadEnvFile 幂等，env.ts 之后再加载一次没有副作用。
 */
const envFile = fileURLToPath(new URL('../../../../.env', import.meta.url));

if (process.env.NODE_ENV !== 'production' && existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

/** 真去建一个临时文件再删掉：只检查目录存在没用，权限/只读会让写入失败 */
function isWritableDir(dir: string): boolean {
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
 * 选一个真的能写的库路径，**不要求用户改目录权限**。
 *
 * 顺序：调用方指定的位置（便携版是程序目录下的 data/）→ %LOCALAPPDATA%\Corpus。
 * 后者是普通用户一定可写的目录，用来兜住「程序放在 Program Files」这类情况。
 */
function resolveDBPath(): string {
    const explicit = process.env.CORPUS_DB?.trim();
    const localBase = process.env.LOCALAPPDATA ?? process.env.TEMP ?? process.cwd();
    const fallback = join(localBase, 'Corpus', 'corpus.db');
    const candidates = explicit ? [explicit, fallback] : [fallback];

    for (const candidate of candidates) {
        if (isWritableDir(dirname(candidate))) {
            return candidate;
        }
    }

    // 都不可写就返回首选，让 openDatabase 把可读的错误抛出来
    return explicit ?? fallback;
}

const dbPath = resolveDBPath();

/** 数据库文件位置，stdio 插件需要通过环境变量拿到它 */
export const DB_PATH = dbPath;

mkdirSync(dirname(dbPath), { recursive: true });

/**
 * 打不开时给一句能照着做的话。
 * 最常见的两种：另一个 Corpus 实例还开着（独占文件），或者目录不可写。
 */
function openDatabase(path: string): DatabaseSync {
    try {
        return new DatabaseSync(path);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);

        throw new Error(
            `打不开数据库 ${path}：${detail}\n` +
                '可能原因：另一个 Corpus 正在运行并占用着它，或者这个目录没有写权限。\n' +
                '处理：关掉其他 Corpus 窗口 / 任务管理器里结束 node.exe 再重试。',
            { cause: error },
        );
    }
}

export const db = openDatabase(dbPath);

// WAL 是性能优化，不是正确性前提：只读库上它会失败，
// 但这种情况下真正该报错的是下面的写探针，别在这里先抛一个含糊的错
try {
    db.exec('PRAGMA journal_mode = WAL');
} catch (error) {
    console.warn(
        '[db] 切换 WAL 失败，继续用默认日志模式：',
        error instanceof Error ? error.message : String(error),
    );
}

db.exec('PRAGMA busy_timeout = 5000');

/** 启动阶段没有别的事可做，同步等一下即可（避免把整个启动流程改成异步） */
function sleepSync(milliseconds: number): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/**
 * 打开后立刻验证可写。
 *
 * 少了这一步，多实例争用或只读目录会一直拖到用户点「保存」才暴露，
 * 报的还是英文 SQLite 原文（attempt to write a readonly database），
 * 用户没法据此判断是开重了还是权限问题。
 *
 * 重试 3 次：同步软件、杀毒扫描会短暂锁文件，一次失败不代表真的不可写。
 */
export function assertDatabaseWritable(): void {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            db.exec('CREATE TABLE IF NOT EXISTS _corpus_write_probe (id INTEGER PRIMARY KEY)');
            db.exec('DROP TABLE IF EXISTS _corpus_write_probe');
            return;
        } catch (error) {
            lastError = error;

            if (attempt < 3) {
                sleepSync(500);
            }
        }
    }

    const detail = lastError instanceof Error ? lastError.message : String(lastError);

    throw new Error(
        `数据库当前不可写：${dbPath}\n` +
            '最常见的原因是还有另一个 Corpus 在运行（同一个数据库被它独占）。\n' +
            '处理：关掉其他 Corpus 窗口；任务管理器里结束 node.exe 后重试。\n' +
            '临时绕开：设置环境变量 CORPUS_DB 指向另一个数据库路径再启动。\n' +
            `原始错误：${detail}`,
        { cause: lastError },
    );
}

export async function runMigrations() {
    db.exec(
        `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);`,
    );

    const applied = new Set(
        (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(
            (row) => row.version,
        ),
    );

    const pedding = migrations
        .filter((m) => !applied.has(m.version))
        .toSorted((a, b) => a.version - b.version);

    if (pedding.length === 0) return;

    // 有迁移才备份，没迁移不动文件
    await backup(db, `${dbPath}.backup`);

    for (const migration of pedding) {
        db.exec('BEGIN');
        try {
            migration.up(db);
            db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
                migration.version,
                Date.now(),
            );
            db.exec('COMMIT');
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    }
}
