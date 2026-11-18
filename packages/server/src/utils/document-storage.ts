import { mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { getSetting, setSetting } from '../repository';

/** settings 表里的键名 */
export const DOCUMENT_STORAGE_KEY = 'documents.storagePath';

export interface DocumentDirs {
    /** 用户设置的根目录 */
    base: string;
    files: string;
    markdown: string;
}

/** 用户设置的文件存储根目录；没设置过返回 null */
export function getDocumentStoragePath(db: DatabaseSync): string | null {
    return getSetting(DOCUMENT_STORAGE_KEY, db);
}

/**
 * 校验并保存存储目录。
 *
 * 只接受绝对路径：相对路径会跟着进程工作目录漂移，等于数据位置不可预期。
 * 保存前实际建一次目录并写探针文件，确认可写——否则要等用户上传时才炸。
 */
export function setDocumentStoragePath(db: DatabaseSync, input: string): string {
    const value = input.trim();

    if (!value) {
        throw new Error('请填写存储目录');
    }

    if (!isAbsolute(value)) {
        throw new Error('必须填写绝对路径，例如 D:\\Corpus\\documents');
    }

    const base = resolve(value);

    try {
        mkdirSync(base, { recursive: true });

        const probe = join(base, '.corpus-write-test');
        writeFileSync(probe, 'ok');
        unlinkSync(probe);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`目录不可写：${message}`, { cause: error });
    }

    setSetting(DOCUMENT_STORAGE_KEY, base, db);

    return base;
}

/** 取解析好的几个目录；没配置就抛错，让上传来不及写文件就失败 */
export function documentDirs(db: DatabaseSync): DocumentDirs {
    const base = getDocumentStoragePath(db);

    if (!base) {
        throw new Error('还没有设置文件存储位置，请先在「上传设置」里填写绝对路径');
    }

    return { base, files: join(base, 'files'), markdown: join(base, 'markdown') };
}

/** 去掉路径分隔符、Windows 不允许的字符和控制字符，避免用户文件名逃出目录 */
function safeFileName(name: string): string {
    const cleaned = name
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\p{Cc}/gu, '')
        .trim();

    return (cleaned || 'file').slice(0, 120);
}

/** 源文件：<base>/files/<documentId>/<原始文件名> */
export function saveSourceFile(
    db: DatabaseSync,
    documentId: string,
    filename: string,
    buffer: Buffer,
): string {
    const { files } = documentDirs(db);
    const directory = join(files, documentId);

    mkdirSync(directory, { recursive: true });

    const path = join(directory, safeFileName(filename));
    writeFileSync(path, buffer);

    return path;
}

/** 解析产物：<base>/markdown/<documentId>.md */
export function saveMarkdown(db: DatabaseSync, documentId: string, markdown: string): string {
    const { markdown: markdownDir } = documentDirs(db);

    mkdirSync(markdownDir, { recursive: true });

    const path = join(markdownDir, `${documentId}.md`);
    writeFileSync(path, markdown, 'utf8');

    return path;
}

export interface RemovableFiles {
    markdownPath?: string | null;
    sourcePath?: string | null;
}

/**
 * 删除文档的磁盘文件（用户选择「连文件一起删」时调用）。
 *
 * 源文件按文档存成独立子目录，删目录即可；但必须确认它确实在 files/ 下面，
 * 避免路径被改坏时误删上层目录。
 */
export function removeDocumentFiles(db: DatabaseSync, files: RemovableFiles): string[] {
    const removed: string[] = [];
    const base = getDocumentStoragePath(db);

    if (files.markdownPath) {
        try {
            rmSync(files.markdownPath, { force: true });
            removed.push(files.markdownPath);
        } catch {
            // 文件已经不在就算了，不能因此让删除接口失败
        }
    }

    if (files.sourcePath) {
        const directory = dirname(files.sourcePath);
        const insideFiles = base
            ? resolve(directory).startsWith(`${resolve(base, 'files')}`)
            : basename(dirname(directory)) === 'files';

        if (insideFiles && basename(directory) !== 'files') {
            try {
                rmSync(directory, { recursive: true, force: true });
                removed.push(directory);
            } catch {
                // 同上
            }
        }
    }

    return removed;
}
