import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createHashingEmbedder, normalizeVector, tokenize } from './embed';

test('分词：英文小写按词，中文按二元组', () => {
    assert.deepEqual(tokenize('Hello World'), ['hello', 'world']);
    assert.deepEqual(tokenize('分块策略'), ['分块', '块策', '策略']);
    // 单个汉字保留原字
    assert.deepEqual(tokenize('块'), ['块']);
    // 中英混排
    assert.deepEqual(tokenize('用 Rust 写'), ['rust', '用', '写']);
});

test('向量：定长、单位化、可复现', async () => {
    const embedder = createHashingEmbedder(32);
    const [first] = await embedder.embed(['分块要控制长度']);
    const [again] = await embedder.embed(['分块要控制长度']);
    const [other] = await embedder.embed(['标题是语义边界']);

    assert.equal(first?.length, 32);
    assert.deepEqual(first, again, '同一输入必须得到同一向量');

    const length = Math.hypot(...(first ?? []));
    assert.ok(Math.abs(length - 1) < 1e-9, '应该是单位向量');

    assert.notDeepEqual(first, other, '不同输入不能得到同一向量');
});

test('normalizeVector：零向量保持全零，不做除零', () => {
    const zero = normalizeVector([0, 0, 0]);
    assert.deepEqual(zero, [0, 0, 0]);
});
