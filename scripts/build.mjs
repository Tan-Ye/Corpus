/**
 * 一条命令完成打包：构建前端 → 打包 server → electron-builder 出安装包。
 *
 * 先把镜像环境变量设上：electron 二进制和 nsis/winCodeSign 默认从 GitHub 拉，
 * 国内很难下完（electron-v45.3.3-win32-x64.zip 就卡在这一步）。
 * electron-builder.yml 里的 electronDownload.mirror 只管 electron 二进制，
 * 工具链走环境变量，所以统一在这里兜底。
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const env = {
    ...process.env,
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
    ELECTRON_BUILDER_BINARIES_MIRROR:
        process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
        'https://npmmirror.com/mirrors/electron-builder-binaries/',
};

function run(command, args, label) {
    console.log(`\n> ${label}`);

    const result = spawnSync(command, args, {
        cwd: repo,
        stdio: 'inherit',
        env,
        // 全部用 node 直接跑脚本，不经过 shell：
        // Windows 上 shell 会把含空格的路径（C:\Program Files\nodejs\node.exe）截断成 C:\Program。
        shell: false,
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

const electronBuilderCli = join(repo, 'node_modules', 'electron-builder', 'cli.js');

try {
    run(
        process.execPath,
        [join(repo, 'scripts', 'build-package.mjs'), '--out', 'dist-package/app'],
        '构建前端与 server 产物',
    );
    run(process.execPath, [electronBuilderCli, '--config', 'electron-builder.yml'], '生成安装包');
} catch (error) {
    console.error('\n打包失败：', error instanceof Error ? error.message : String(error));
    process.exit(1);
}

console.log('\n完成：dist-package/electron/');
