import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { migration } from '../db/migrations/008-settings';
import {
    DOCUMENT_STORAGE_KEY,
    documentDirs,
    getDocumentStoragePath,
    removeDocumentFiles,
    saveMarkdown,
    saveSourceFile,
    setDocumentStoragePath,
} from './document-storage';

function makeDb(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    migration.up(db);
    return db;
}

function tempBase(): string {
    return join(mkdtempSync(join(tmpdir(), 'corpus-storage-')), 'documents');
}

test('没设置时：读不到路径，取目录直接报错', () => {
    const db = makeDb();

    assert.equal(getDocumentStoragePath(db), null);
    assert.throws(() => documentDirs(db), /还没有设置文件存储位置/);

    db.close();
});

test('校验：相对路径不接受，绝对路径能保存', () => {
    const db = makeDb();
    const base = tempBase();

    assert.throws(() => setDocumentStoragePath(db, 'documents'), /绝对路径/);
    assert.throws(() => setDocumentStoragePath(db, ''), /请填写存储目录/);

    const saved = setDocumentStoragePath(db, base);

    assert.equal(saved, base);
    assert.equal(getDocumentStoragePath(db), base);
    assert.ok(existsSync(base), '目录应该被创建出来');
    // 探针文件不能残留
    assert.deepEqual(readdirSync(base), []);

    db.close();
    rmSync(base, { recursive: true, force: true });
});

test('保存文件：源文件和 markdown 分别落到 files/ 和 markdown/', () => {
    const db = makeDb();
    const base = tempBase();

    setDocumentStoragePath(db, base);

    const sourcePath = saveSourceFile(db, 'doc-1', '规范.pdf', Buffer.from('pdf-bytes'));
    const markdownPath = saveMarkdown(db, 'doc-1', '# 标题\n\n正文');

    assert.equal(sourcePath, join(base, 'files', 'doc-1', '规范.pdf'));
    assert.equal(markdownPath, join(base, 'markdown', 'doc-1.md'));
    assert.equal(readFileSync(markdownPath, 'utf8'), '# 标题\n\n正文');
    assert.ok(readFileSync(sourcePath).equals(Buffer.from('pdf-bytes')));

    db.close();
    rmSync(base, { recursive: true, force: true });
});

test('非法文件名被清理，不能逃出目标目录', () => {
    const db = makeDb();
    const base = tempBase();

    setDocumentStoragePath(db, base);

    const sourcePath = saveSourceFile(db, 'doc-2', '../../evil.exe', Buffer.from('x'));

    assert.equal(sourcePath, join(base, 'files', 'doc-2', '.._.._evil.exe'));

    db.close();
    rmSync(base, { recursive: true, force: true });
});

test('删除文件：markdown 和文档子目录一起删，目录外的文件不动', () => {
    const db = makeDb();
    const base = tempBase();
    const outside = mkdtempSync(join(tmpdir(), 'corpus-outside-'));
    const outsideFile = join(outside, 'keep.txt');

    setDocumentStoragePath(db, base);
    writeFileSync(outsideFile, 'keep me');

    const sourcePath = saveSourceFile(db, 'doc-3', '规范.md', Buffer.from('x'));
    const markdownPath = saveMarkdown(db, 'doc-3', '# 标题');

    const removed = removeDocumentFiles(db, { markdownPath, sourcePath });

    assert.equal(removed.length, 2);
    assert.ok(!existsSync(markdownPath), 'markdown 应该被删除');
    assert.ok(!existsSync(sourcePath), '源文件应该被删除');

    // 不在 files/ 下的路径不能被误删
    removeDocumentFiles(db, { sourcePath: outsideFile });
    assert.ok(existsSync(outsideFile), '目录外的文件必须保留');

    db.close();
    rmSync(base, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
});

test('重复设置：后一次覆盖前一次', () => {
    const db = makeDb();
    const first = tempBase();
    const second = tempBase();

    setDocumentStoragePath(db, first);
    setDocumentStoragePath(db, second);

    assert.equal(getDocumentStoragePath(db), second);

    const row = db
        .prepare('SELECT value FROM settings WHERE key = ?')
        .get(DOCUMENT_STORAGE_KEY) as { value: string };
    assert.equal(row.value, second);

    db.close();
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
});
