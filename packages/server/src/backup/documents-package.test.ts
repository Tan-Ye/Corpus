import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { migration as settingsMigration } from '../db/migrations/008-settings';
import { ingestDocument } from '../retrieval/ingest';
import { createRetrievalSchema } from '../retrieval/schema';
import { listDocuments } from '../retrieval/store';
import { saveMarkdown, saveSourceFile, setDocumentStoragePath } from '../utils/document-storage';
import { readZipEntries } from '../utils/docs/zip';
import { exportDocumentPackage, importDocumentPackage } from './documents-package';

const MARKDOWN = readFileSync(
    fileURLToPath(new URL('../../test-files/民法典.md', import.meta.url)),
    'utf8',
);

function makeDb(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    createRetrievalSchema(db);
    settingsMigration.up(db);
    return db;
}

async function seedDocument(db: DatabaseSync, title: string) {
    const documentId = crypto.randomUUID();
    const sourcePath = saveSourceFile(db, documentId, '民法典.md', Buffer.from(MARKDOWN));
    const markdownPath = saveMarkdown(db, documentId, MARKDOWN);

    await ingestDocument(db, {
        documentId,
        title,
        text: MARKDOWN,
        source: '民法典.md',
        sourcePath,
        markdownPath,
    });
}

test('导出文档包：只有源文件 + manifest，没有 chunks', async () => {
    const storage = mkdtempSync(join(tmpdir(), 'corpus-package-'));
    const db = makeDb();

    setDocumentStoragePath(db, storage);
    await seedDocument(db, '民法典');

    const archive = exportDocumentPackage(db);
    const entries = readZipEntries(archive);

    assert.ok(entries.has('manifest.json'));
    assert.equal(
        [...entries.keys()].filter((name) => name.startsWith('files/')).length,
        1,
    );

    const manifest = JSON.parse(entries.get('manifest.json')?.toString('utf8') ?? '{}') as {
        version: number;
        documents: { title: string; filename: string }[];
    };

    assert.equal(manifest.version, 1);
    assert.equal(manifest.documents[0]?.title, '民法典');
    assert.equal(manifest.documents[0]?.filename, '民法典.md');

    db.close();
    rmSync(storage, { recursive: true, force: true });
});

test('导入文档包：重新解析入库，重复导入会去重', async () => {
    const sourceStorage = mkdtempSync(join(tmpdir(), 'corpus-package-src-'));
    const targetStorage = mkdtempSync(join(tmpdir(), 'corpus-package-dst-'));

    const sourceDb = makeDb();
    setDocumentStoragePath(sourceDb, sourceStorage);
    await seedDocument(sourceDb, '民法典');
    const archive = exportDocumentPackage(sourceDb);
    sourceDb.close();

    const targetDb = makeDb();
    setDocumentStoragePath(targetDb, targetStorage);

    const first = await importDocumentPackage(targetDb, archive);
    assert.equal(first.imported, 1);
    assert.deepEqual(first.skipped, []);

    const [document] = listDocuments(targetDb);
    assert.equal(document?.title, '民法典');
    assert.ok(Number(document?.chunkCount) > 300, '应该重新切出块');

    const second = await importDocumentPackage(targetDb, archive);
    assert.equal(second.imported, 0);
    assert.match(second.skipped[0]?.reason ?? '', /内容已存在/);
    assert.equal(listDocuments(targetDb).length, 1);

    targetDb.close();
    rmSync(sourceStorage, { recursive: true, force: true });
    rmSync(targetStorage, { recursive: true, force: true });
});

test('导入文档包：不是 Corpus 的压缩包要报错', async () => {
    const storage = mkdtempSync(join(tmpdir(), 'corpus-package-'));
    const db = makeDb();

    setDocumentStoragePath(db, storage);

    const { createZip } = await import('../utils/docs/zip-writer');
    const archive = createZip([{ name: 'random.txt', data: Buffer.from('x') }]);

    await assert.rejects(() => importDocumentPackage(db, archive), /manifest\.json/);

    db.close();
    rmSync(storage, { recursive: true, force: true });
});
