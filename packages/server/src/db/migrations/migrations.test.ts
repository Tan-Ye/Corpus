import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { migration as citationsMigration } from './009-message-citations';
import { migration as logRetrievalMigration } from './010-log-retrieval';

test('009：给 messages 加 citations 列，重复执行不报错', () => {
    const db = new DatabaseSync(':memory:');
    db.exec("CREATE TABLE messages (id TEXT PRIMARY KEY, content TEXT NOT NULL)");

    citationsMigration.up(db);
    citationsMigration.up(db);

    const columns = (
        db.prepare('PRAGMA table_info(messages)').all() as unknown as { name: string }[]
    ).map((column) => column.name);

    assert.ok(columns.includes('citations'));

    db.close();
});

test('010：重建 logs 表，老数据保留且能写 retrieval', () => {
    const db = new DatabaseSync(':memory:');

    // 旧的 logs 表（CHECK 里没有 retrieval）
    db.exec(`
        CREATE TABLE logs (
            id              TEXT PRIMARY KEY,
            conversation_id TEXT,
            type            TEXT NOT NULL CHECK (type IN ('tool', 'llm', 'error')),
            name            TEXT NOT NULL,
            detail          TEXT,
            duration_ms     INTEGER,
            ok              INTEGER NOT NULL,
            created_at      INTEGER NOT NULL
        );
    `);

    db.prepare(
        `INSERT INTO logs (id, conversation_id, type, name, detail, duration_ms, ok, created_at)
         VALUES ('l1', 'c1', 'tool', 'mdn__search', 'q=test', 120, 1, 1000)`,
    ).run();

    logRetrievalMigration.up(db);

    const kept = db.prepare('SELECT * FROM logs WHERE id = ?').get('l1') as {
        type: string;
        name: string;
        duration_ms: number;
    };

    assert.equal(kept.type, 'tool');
    assert.equal(kept.name, 'mdn__search');
    assert.equal(kept.duration_ms, 120, '老数据要原样保留');

    // 新类型必须能写进去
    db.prepare(
        `INSERT INTO logs (id, conversation_id, type, name, detail, duration_ms, ok, created_at)
         VALUES ('l2', 'c1', 'retrieval', '文档检索', 'hits=3', 40, 1, 2000)`,
    ).run();

    assert.equal(
        (db.prepare('SELECT COUNT(*) AS c FROM logs').get() as { c: number }).c,
        2,
    );

    db.close();
});
