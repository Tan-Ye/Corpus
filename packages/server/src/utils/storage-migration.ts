import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { listDocuments } from '../retrieval/store';

export interface StorageMigrationResult {
    movedDocuments: number;
    movedFiles: number;
    /** 旧目录里登记了、但文件已经不存在的路径 */
    missing: string[];
}

/**
 * 把文档文件从旧存储目录搬到新目录。
 *
 * 只搬数据库里登记过的路径（source_path / markdown_path），
 * 搬完把新路径写回库；旧目录里残留的空目录顺手清掉。
 */
export function migrateDocumentStorage(
    db: DatabaseSync,
    from: string,
    to: string,
): StorageMigrationResult {
    const source = resolve(from);
    const target = resolve(to);
    const result: StorageMigrationResult = { movedDocuments: 0, movedFiles: 0, missing: [] };

    if (source === target) {
        return result;
    }

    function relocate(path: string | null | undefined): string | null {
        if (!path) {
            return null;
        }

        const absolute = resolve(path);

        // 不在旧目录下的路径原样保留（比如手动指向别处）
        if (absolute !== source && !absolute.startsWith(`${source}${sep}`)) {
            return path;
        }

        if (!existsSync(absolute)) {
            result.missing.push(absolute);
            return path;
        }

        const destination = join(target, relative(source, absolute));

        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(absolute, destination);
        rmSync(absolute, { force: true });
        result.movedFiles += 1;

        return destination;
    }

    const update = db.prepare(
        'UPDATE documents SET source_path = ?, markdown_path = ? WHERE id = ?',
    );

    for (const document of listDocuments(db)) {
        const sourcePath = relocate(document.sourcePath);
        const markdownPath = relocate(document.markdownPath);

        if (
            sourcePath !== (document.sourcePath ?? null) ||
            markdownPath !== (document.markdownPath ?? null)
        ) {
            update.run(sourcePath, markdownPath, document.id);
            result.movedDocuments += 1;
        }
    }

    // 旧目录只剩空壳时清掉，避免留下「看起来有数据」的空文件夹
    for (const name of ['files', 'markdown']) {
        const directory = join(source, name);

        try {
            if (existsSync(directory) && readdirSync(directory).length === 0) {
                rmSync(directory, { recursive: true, force: true });
            }
        } catch {
            // 清不掉空目录不影响数据，忽略
        }
    }

    return result;
}
