/**
 * PDF 文本的结构化预处理。
 *
 * PDF 里没有段落和标题，只有一行行文字。直接喂给分块器会得到：
 * 一个覆盖全文的「大段落」、空的 headingPath、以及没法用的行号定位。
 *
 * 这里做两件事（只做能提高定位精度的，不做内容改写）：
 * 1. 合并被 PDF 换行拆碎的句子 —— 行尾没有句末标点就并到下一行
 * 2. 把中文法规/标准里天然的结构行（编/分编/章/节）提升成 Markdown 标题，
 *    并把「第 X 条」当成新段落的起点
 *
 * 只对「看起来有结构」的文本生效；普通文章原样返回，不会硬塞标题。
 */

/** 句子结束的标点：行尾是这些说明这一行说完了 */
const SENTENCE_END = /[。！？；：!?;:…」』”）)]$/;

/** 中文法规的结构行：第X编 / 第X分编 / 第X章 / 第X节 */
const STRUCTURE_LINE =
    /^(第[〇零一二三四五六七八九十百千两]+(编|分编|章|节))(?:\s|$)/;

/** 「第 X 条」既是段落边界，也常带标题（【xx】） */
const ARTICLE_LINE = /^(第[〇零一二三四五六七八九十百千两]+条)(?:\s|$)/;

/** 【制定机关】这类字段行，一个字段一行 */
const FIELD_LINE = /^【/;

/**
 * 这些短标签自己成段，不要并进上一行。
 * 必须是白名单：法规正文里「可以约定」这类短续行如果也被当成标签，句子会被切碎。
 */
const LABELS = new Set(['文章属性', '正文', '目录', '附件', '附录', '前言', '序言', '后记']);

function headingLevel(line: string): number | null {
    if (/^第[〇零一二三四五六七八九十百千两]+编(?:\s|$)/.test(line)) {
        return 1;
    }

    if (/^第[〇零一二三四五六七八九十百千两]+(分编|章)(?:\s|$)/.test(line)) {
        return 2;
    }

    if (/^第[〇零一二三四五六七八九十百千两]+节(?:\s|$)/.test(line)) {
        return 3;
    }

    return null;
}

/** 判断一段文本是不是「有结构的法规式文本」：结构行至少出现 3 次才算 */
export function looksStructured(text: string): boolean {
    const hits = text
        .split('\n')
        .filter((line) => STRUCTURE_LINE.test(line.trim())).length;

    return hits >= 3;
}

/** 英文行尾拼接需要空格，中文直接连上 */
function joinLines(left: string, right: string): string {
    if (!left) {
        return right;
    }

    const needsSpace = /[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right);

    return needsSpace ? `${left} ${right}` : `${left}${right}`;
}

/**
 * 一行里可能塞了多个结构单元：PDF 的「文章属性 【制定机关】… 【公布日期】…」
 * 全在一行，短标签也可能直接粘在正文前面。先拆开再按行处理。
 */
function expandLine(line: string): string[] {
    const parts: string[] = [];
    let rest = line;

    for (const label of LABELS) {
        if (rest.startsWith(label) && rest.length > label.length) {
            parts.push(label);
            rest = rest.slice(label.length).trim();
        }
    }

    const fieldCount = (rest.match(/【/g) ?? []).length;

    // 只有一个【】时是条文自带的标题，不能拆（「第一条 【立法目的】…」）
    if (fieldCount >= 2) {
        parts.push(
            ...rest
                .replaceAll('【', '\u0000【')
                .split('\u0000')
                .map((part) => part.trim())
                .filter(Boolean),
        );
    } else if (rest) {
        parts.push(rest);
    }

    return parts;
}

/**
 * 合并换行、并按结构行切段。
 * 输出是「段落之间空一行」的 Markdown 前体，交给 parseMarkdown 之前用。
 */
export function normalizePdfMarkdown(raw: string): string {
    const lines = raw
        .split(/\r?\n/)
        // PDF 里常混进 Wingdings 项目符号（私用区字符）和不换行空格，
        // 它们会挡在「【」「第X条」前面，让结构识别失效
        .map((line) => line.replace(/[\uE000-\uF8FF]/g, '').replaceAll('\u00a0', ' '))
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .flatMap(expandLine);

    const blocks: string[] = [];
    let current = '';

    const flush = () => {
        if (current) {
            blocks.push(current);
            current = '';
        }
    };

    for (const line of lines) {
        // PDF 里偶尔本来就有 markdown 痕迹（转换过的文档），保持原样
        if (line.startsWith('#')) {
            flush();
            blocks.push(line);
            continue;
        }

        const level = headingLevel(line);

        if (level !== null) {
            flush();
            blocks.push(`${'#'.repeat(level)} ${line}`);
            continue;
        }

        // 第 X 条：新起一段，但保持正文（不提升为标题，否则每篇几百个标题）
        if (ARTICLE_LINE.test(line)) {
            flush();
            current = line;
            continue;
        }

        // 「目录」本身没有信息量；目录里的各章标题会变成空节，解析时自动被跳过
        if (line === '目录') {
            flush();
            continue;
        }

        // 字段行和短标签自己成段，不要并进上一行
        if (FIELD_LINE.test(line) || LABELS.has(line)) {
            flush();
            current = line;
            continue;
        }

        // 上一行说完了 → 这行是新段落；否则是被 PDF 拆碎的续行
        if (current && SENTENCE_END.test(current)) {
            flush();
            current = line;
            continue;
        }

        current = joinLines(current, line);
    }

    flush();

    return `${blocks.join('\n\n')}\n`;
}
