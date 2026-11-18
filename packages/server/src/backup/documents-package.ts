import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { getEmbedder } from '../retrieval/embedder';
import { hashMarkdown, ingestDocument } from '../retrieval/ingest';
import { findDocumentByHash, listDocuments } from '../retrieval/store';
import { parseDocument } from '../utils/docs';
import { readZipEntries } from '../utils/docs/zip';
import { createZip } from '../utils/docs/zip-writer';
import { getDocumentStoragePath, saveMarkdown, saveSourceFile } from '../utils/document-storage';

const MANIFEST_NAME = 'manifest.json';
const PACKAGE_VERSION = 1;

interface PackageDocument {
    id: string;
    title: string;
    source: string | null;
    filename: string;
}

interface PackageManifest {
    version: number;
    exportedAt: string;
    documents: PackageDocument[];
}

/**
 * 导出文档包：只带源文件 + 清单，不带 chunks 和数据库。
 *
 * 恢复时重新解析入库——分块规则、索引结构以后改了也能用旧包恢复，
 * 这比 SQLite 快照更耐用。没有源文件的文档（粘贴入库）无法导出，跳过。
 */
export function exportDocumentPackage(db: DatabaseSync): Buffer {
    const manifest: PackageManifest = {
        version: PACKAGE_VERSION,
        exportedAt: new Date().toISOString(),
        documents: [],
    };

    const files: { name: string; data: Buffer }[] = [];

    for (const document of listDocuments(db)) {
        if (!document.sourcePath || !existsSync(document.sourcePath)) {
            continue;
        }

        const filename = basename(document.sourcePath);
        const name = `files/${document.id}/${filename}`;

        files.push({ name, data: readFileSync(document.sourcePath) });
        manifest.documents.push({
            id: document.id,
            title: document.title,
            source: document.source,
            filename,
        });
    }

    return createZip([
        { name: MANIFEST_NAME, data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') },
        ...files,
    ]);
}

export interface ImportedPackageResult {
    imported: number;
    skipped: { title: string; reason: string }[];
}

/**
 * 导入文档包：逐个文件重新走「解析 → 分块 → 入库」。
 *
 * 按内容哈希去重，所以重复导入同一个包不会产生重复文档。
 */
export async function importDocumentPackage(
    db: DatabaseSync,
    archive: Buffer,
): Promise<ImportedPackageResult> {
    if (!getDocumentStoragePath(db)) {
        throw new Error('还没有设置文件存储位置，无法导入文档包');
    }

    const entries = readZipEntries(archive);
    const manifestEntry = entries.get(MANIFEST_NAME);

    if (!manifestEntry) {
        throw new Error('压缩包里缺少 manifest.json，不是 Corpus 导出的文档包');
    }

    let manifest: PackageManifest;

    try {
        manifest = JSON.parse(manifestEntry.toString('utf8')) as PackageManifest;
    } catch {
        throw new Error('manifest.json 不是合法 JSON');
    }

    if (manifest.version !== PACKAGE_VERSION || !Array.isArray(manifest.documents)) {
        throw new Error(`不支持的文档包版本：${String(manifest.version)}`);
    }

    const result: ImportedPackageResult = { imported: 0, skipped: [] };

    for (const item of manifest.documents) {
        const file = entries.get(`files/${item.id}/${item.filename}`);

        if (!file) {
            result.skipped.push({ title: item.title, reason: '压缩包里找不到源文件' });
            continue;
        }

        let parsed: Awaited<ReturnType<typeof parseDocument>>;

        try {
            parsed = await parseDocument(item.filename, file);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            result.skipped.push({ title: item.title, reason: `解析失败：${message}` });
            continue;
        }

        if (findDocumentByHash(db, hashMarkdown(parsed.markdown))) {
            result.skipped.push({ title: item.title, reason: '内容已存在' });
            continue;
        }

        const documentId = crypto.randomUUID();
        const sourcePath = saveSourceFile(db, documentId, item.filename, file);
        const markdownPath = saveMarkdown(db, documentId, parsed.markdown);

        await ingestDocument(
            db,
            {
                documentId,
                title: item.title,
                text: parsed.markdown,
                source: item.filename,
                sourcePath,
                markdownPath,
            },
            getEmbedder(),
        );

        result.imported += 1;
    }

    return result;
}
