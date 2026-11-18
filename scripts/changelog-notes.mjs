/**
 * 从 CHANGELOG.md 里取某个版本的正文，写成 release-notes.md。
 *
 * 约定：发布前在 CHANGELOG.md 顶部补一段
 *   ## [0.2.0] - 2026-11-20
 * 下面写这次发布的内容；Release 说明就用这一段。
 *
 * 用法：
 *   node scripts/changelog-notes.mjs v0.1.0
 *   node scripts/changelog-notes.mjs 0.1.0
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const raw = process.argv[2];
const version = raw?.replace(/^v/, '');

if (!version) {
    console.error('用法：node scripts/changelog-notes.mjs <版本号>');
    process.exit(1);
}

const changelogPath = join(repo, 'CHANGELOG.md');
const lines = readFileSync(changelogPath, 'utf8').split(/\r?\n/);
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const heading = new RegExp(`^##\\s*\\[${escaped}\\]`);

const start = lines.findIndex((line) => heading.test(line));

if (start === -1) {
    console.error(
        `CHANGELOG.md 里没有 [${version}] 段落。先在 CHANGELOG.md 顶部补上 \`## [${version}] - 日期\` 再打 tag。`,
    );
    process.exit(1);
}

let end = lines.findIndex((line, index) => index > start && /^##\s*\[/.test(line));

if (end === -1) {
    end = lines.length;
}

const body = lines
    .slice(start + 1, end)
    .join('\n')
    .trim()
    .replace(/\n---\s*$/, '')
    .replace(/^---\s*\n/, '')
    .trim();

if (!body) {
    console.error(`CHANGELOG.md 的 [${version}] 段落是空的，补上内容再打 tag。`);
    process.exit(1);
}

const outPath = join(repo, 'release-notes.md');
writeFileSync(outPath, `${body}\n`, 'utf8');
console.log(`已提取 ${version} 的发布说明：${outPath}（${body.length} 字）`);
