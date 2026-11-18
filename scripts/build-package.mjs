/**
 * 构建 Electron 安装包所需的前端与 server 产物：dist-package/app/
 *
 * 用法：
 *   node scripts/build-package.mjs              # 构建前端 + 打包 server + 复制资源
 *   node scripts/build-package.mjs --skip-web   # 复用现有 packages/web/dist
 *   node scripts/build-package.mjs --out <目录>  # 指定输出目录
 *
 * 产物由 electron-builder 通过 extraResources 装进安装包：
 *   server.mjs → resources/server.mjs
 *   web/       → resources/web/
 *   resources/ → resources/resources/（prompts、plugins）
 *
 * 不再生成 node.exe / launcher.mjs / start.bat：Electron 自带运行时，
 * 启动逻辑在 packages/shell/main.mjs。
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skipWeb = process.argv.includes('--skip-web');

// --out <目录>：有进程占着旧产物时，换个目录照样能出包
const outIndex = process.argv.indexOf('--out');
const outDir =
    outIndex !== -1 && process.argv[outIndex + 1]
        ? resolve(process.argv[outIndex + 1])
        : join(repo, 'dist-package', 'app');

/** pnpm 把依赖放在 .pnpm 下，根目录没有顶层链接，所以这里按前缀找 */
function findInPnpm(prefix) {
    const pnpmDir = join(repo, 'node_modules', '.pnpm');

    if (!existsSync(pnpmDir)) {
        throw new Error('node_modules/.pnpm 不存在，先跑 pnpm install');
    }

    const dir = readdirSync(pnpmDir).find((name) => name.startsWith(`${prefix}@`));

    if (!dir) {
        throw new Error(`找不到依赖 ${prefix}`);
    }

    return join(pnpmDir, dir, 'node_modules', prefix);
}

const webDist = join(repo, 'packages', 'web', 'dist');

if (skipWeb) {
    console.log('跳过前端构建（--skip-web），复用现有的 web/dist');
} else {
    console.log('构建前端…');
    const vite = join(findInPnpm('vite'), 'bin', 'vite.js');
    const result = spawnSync(process.execPath, [vite, 'build'], {
        cwd: join(repo, 'packages', 'web'),
        stdio: 'inherit',
    });

    if (result.status !== 0) {
        throw new Error('前端构建失败');
    }
}

if (!existsSync(join(webDist, 'index.html'))) {
    throw new Error('web/dist/index.html 不存在，先构建前端（去掉 --skip-web）');
}

try {
    rmSync(outDir, { recursive: true, force: true });
} catch {
    throw new Error(
        `无法清理旧产物：${outDir}\n` +
            '可能有进程正占用里面的文件（比如正在运行的 Corpus）。关掉它再重试，或用 --out 换个目录。',
    );
}

mkdirSync(outDir, { recursive: true });

console.log('打包 server…');
const rolldownUrl = pathToFileURL(join(findInPnpm('rolldown'), 'dist', 'index.mjs')).href;
const { build } = await import(rolldownUrl);

await build({
    input: join(repo, 'packages', 'server', 'src', 'index.ts'),
    platform: 'node',
    external: [/^node:/],
    output: {
        dir: outDir,
        format: 'esm',
        codeSplitting: false,
        entryFileNames: 'server.mjs',
    },
});

console.log('复制前端与资源…');
cpSync(webDist, join(outDir, 'web'), { recursive: true });
mkdirSync(join(outDir, 'resources'), { recursive: true });
cpSync(join(repo, 'prompts'), join(outDir, 'resources', 'prompts'), { recursive: true });
cpSync(join(repo, 'plugins'), join(outDir, 'resources', 'plugins'), { recursive: true });

console.log(`\n完成：${outDir}`);
console.log('下一步：electron-builder --config electron-builder.yml（或直接 pnpm build）。');
