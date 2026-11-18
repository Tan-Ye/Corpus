/**
 * 组装便携版目录：dist-package/Corpus-<version>-win64/
 *
 * 用法：
 *   node scripts/build-package.mjs              # 构建前端 + 打包 server + 组装
 *   node scripts/build-package.mjs --skip-web   # 复用现有 packages/web/dist
 *
 * 产物不再依赖 node_modules：server 被 rolldown 打成单文件，
 * 前端是 vite build 的静态文件，运行时只需随包的 node.exe。
 */
import { spawnSync } from 'node:child_process';
import {
    copyFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
const version = pkg.version ?? '0.0.0';
const skipWeb = process.argv.includes('--skip-web');

// --out <目录>：旧产物正在被运行中的 Corpus 占用时，换个目录照样能出包
const outIndex = process.argv.indexOf('--out');
const outDir =
    outIndex !== -1 && process.argv[outIndex + 1]
        ? resolve(process.argv[outIndex + 1])
        : join(repo, 'dist-package', `Corpus-${version}-win64`);

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
            '多半是有个 Corpus 还在运行、占着里面的 node.exe（命令行窗口没关，或任务管理器里还有 node.exe）。\n' +
            '关掉它再重试；不想关的话用 --out 指定另一个输出目录。',
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

console.log('复制 node.exe（约 80MB，首次较慢）…');
copyFileSync(process.execPath, join(outDir, 'node.exe'));

copyFileSync(join(repo, 'scripts', 'launcher.mjs'), join(outDir, 'launcher.mjs'));

writeFileSync(
    join(outDir, 'start.bat'),
    // bat 文件保持纯 ASCII：cmd 按系统代码页解析文件本身，写中文需要 GBK，
    // 而 Node 没有 GBK 编码器（之前的 'ascii' 写入直接变成了乱码）。
    // 中文提示放在 launcher 里输出，配合 chcp 65001 显示正常。
    [
        '@echo off',
        'chcp 65001 >nul',
        'cd /d "%~dp0"',
        'node.exe launcher.mjs',
        'if errorlevel 1 (',
        '  echo.',
        '  echo Startup failed. See startup.log in this folder for details.',
        '  pause',
        ')',
    ].join('\r\n') + '\r\n',
    'ascii',
);

// 加 BOM：记事本对无 BOM 的 UTF-8 依赖启发式判断，加一个最稳
writeFileSync(join(outDir, 'README.txt'), `\uFEFF${readme(version)}`, 'utf8');

console.log(`\n完成：${outDir}`);
console.log('双击 start.bat 即可启动；数据默认在 %APPDATA%\\Corpus\\。');

function readme(v) {
    return [
        `Corpus ${v}（便携版）`,
        '',
        '一、启动',
        '  双击 start.bat。首次启动会在浏览器打开 http://127.0.0.1:8787/',
        '  命令行窗口不要关：关掉它就等于关掉服务。',
        '',
        '二、首次使用（顺序不能反）',
        '  1. 点右上角的模型徽章（显示「未配置模型」），填服务地址、模型名、API Key。',
        '     例：https://api.deepseek.com/v1  +  deepseek-chat  +  sk-...',
        '  2. 侧栏「文档」→ 设置文件存储位置（必填，否则不能上传）。',
        '  3. 上传 Markdown / 文本 / Word / PDF，然后提问。',
        '  答案里的 [n] 可以点开看原文。资料里没有的，它会直接说没有。',
        '',
        '三、常见问题',
        '  启动失败：见同目录 startup.log；最常见是端口被占用，关掉旧的 Corpus 进程再试。',
        '  端口被占用时会自动往后找可用端口，浏览器地址以命令行窗口打印的为准。',
        '  换机器：数据在 %APPDATA%\\Corpus\\（corpus.db + 文档文件），整个目录拷走即可。',
        '  备份：侧栏底部「备份」导出 zip（只含文档源文件，不含会话和设置）。',
        '',
        '四、卸载',
        '  直接删掉本目录，再删 %APPDATA%\\Corpus\\ 即可，不写注册表、不留后台服务。',
        '',
    ].join('\r\n');
}
