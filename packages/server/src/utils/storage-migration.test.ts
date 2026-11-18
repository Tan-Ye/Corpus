import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ingestDocument } from '../retrieval/ingest';
import { createRetrievalSchema } from '../retrieval/schema';
import { getDocumentById } from '../retrieval/store';
import { migration as settingsMigration } from '../db/migrations/008-settings';
import { saveMarkdown, saveSourceFile, setDocumentStoragePath } from './document-storage';
import { migrateDocumentStorage } from './storage-migration';

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

test('迁移存储：文件搬到新目录，库里的路径同步更新', async () => {
    const oldBase = mkdtempSync(join(tmpdir(), 'corpus-old-'));
    const newBase = mkdtempSync(join(tmpdir(), 'corpus-new-'));
    const db = makeDb();

    setDocumentStoragePath(db, oldBase);

    const documentId = 'doc-migrate';
    const sourcePath = saveSourceFile(db, documentId, '民法典.md', Buffer.from(MARKDOWN));
    const markdownPath = saveMarkdown(db, documentId, MARKDOWN);

    await ingestDocument(db, {
        documentId,
        title: '民法典',
        text: MARKDOWN,
        sourcePath,
        markdownPath,
    });

    setDocumentStoragePath(db, newBase);

    const result = migrateDocumentStorage(db, oldBase, newBase);

    assert.equal(result.movedDocuments, 1);
    assert.ok(result.movedFiles >= 2);
    assert.deepEqual(result.missing, []);

    const movedMarkdown = join(newBase, 'markdown', `${documentId}.md`);
    const movedSource = join(newBase, 'files', documentId, '民法典.md');

    assert.ok(existsSync(movedMarkdown), 'markdown 应该搬到新目录');
    assert.ok(existsSync(movedSource), '源文件应该搬到新目录');
    assert.ok(!existsSync(markdownPath), '旧路径不该再有文件');

    const document = getDocumentById(db, documentId);
    assert.equal(document?.markdownPath, movedMarkdown);
    assert.equal(document?.sourcePath, movedSource);

    db.close();
    rmSync(oldBase, { recursive: true, force: true });
    rmSync(newBase, { recursive: true, force: true });
});

test('迁移存储：源文件缺失时记录在 missing 里，不中断其他文档', async () => {
    const oldBase = mkdtempSync(join(tmpdir(), 'corpus-old-'));
    const newBase = mkdtempSync(join(tmpdir(), 'corpus-new-'));
    const db = makeDb();

    setDocumentStoragePath(db, oldBase);

    const documentId = 'doc-lost';
    const markdownPath = saveMarkdown(db, documentId, MARKDOWN);
    // 源文件从未落盘（模拟被手动删掉）
    const sourcePath = join(oldBase, 'files', documentId, 'lost.md');

    await ingestDocument(db, {
        documentId,
        title: '民法典',
        text: MARKDOWN,
        sourcePath,
        markdownPath,
    });

    setDocumentStoragePath(db, newBase);
    const result = migrateDocumentStorage(db, oldBase, newBase);

    assert.equal(result.movedDocuments, 1, 'markdown 还是能搬');
    assert.equal(result.missing.length, 1);
    assert.match(result.missing[0] ?? '', /lost\.md/);

    db.close();
    rmSync(oldBase, { recursive: true, force: true });
    rmSync(newBase, { recursive: true, force: true });
});
