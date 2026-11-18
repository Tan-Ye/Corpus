import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readZipEntries } from './zip';
import { createZip } from './zip-writer';

test('zip 写入 → 读取：内容原样往返', () => {
    const archive = createZip([
        { name: 'manifest.json', data: Buffer.from('{"version":1}', 'utf8') },
        { name: 'files/doc-1/中文名.md', data: Buffer.from('# 标题\n\n正文', 'utf8') },
    ]);

    const entries = readZipEntries(archive);

    assert.equal(entries.size, 2);
    assert.equal(entries.get('manifest.json')?.toString('utf8'), '{"version":1}');
    assert.equal(entries.get('files/doc-1/中文名.md')?.toString('utf8'), '# 标题\n\n正文');
});

test('zip 写入：空列表也能生成合法压缩包', () => {
    const entries = readZipEntries(createZip([]));

    assert.equal(entries.size, 0);
});

test('zip 写入：二进制内容不被破坏', () => {
    const data = Buffer.from([0, 1, 2, 255, 128, 64]);

    const entries = readZipEntries(createZip([{ name: 'bin', data }]));

    assert.deepEqual([...(entries.get('bin') ?? [])], [...data]);
});
