import { fileURLToPath } from 'node:url';

/**
 * 资源根目录（prompts/、plugins/）。
 *
 * 开发时按源码位置算（仓库根）；打包后用 CORPUS_RESOURCES_DIR 指定。
 * 不能只靠 import.meta.url：esbuild 打成的单文件放在包根，相对路径会指到包外，
 * 而读不到时是静默降级（系统提示词变空、插件消失），所以打包必须显式设置。
 */
export function resourcesDir(): string {
    const fromEnv = process.env.CORPUS_RESOURCES_DIR?.trim();

    if (fromEnv) {
        return fromEnv;
    }

    return fileURLToPath(new URL('../../../', import.meta.url));
}
