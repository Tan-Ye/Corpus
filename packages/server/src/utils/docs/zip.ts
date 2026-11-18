import { inflateRawSync } from 'node:zlib';

interface ZipEntry {
    method: number;
    compressedSize: number;
    localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/**
 * 最小 ZIP 读取器：只做 docx 需要的那点事。
 *
 * 不引依赖的原因：docx 本质是一个 zip 包，读中央目录 + inflate 就够了，
 * 引一个通用解压库不划算（也比较难控制安全边界）。
 */
export function readZipEntries(buffer: Buffer): Map<string, Buffer> {
    const entries = new Map<string, Buffer>();

    // 1. 从尾部找 EOCD（可能带注释，所以往回扫）
    let eocdOffset = -1;

    for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
        if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
            eocdOffset = offset;
            break;
        }
    }

    if (eocdOffset < 0) {
        throw new Error('不是合法的 zip/docx 文件');
    }

    const entryCount = buffer.readUInt16LE(eocdOffset + 10);
    let cursor = buffer.readUInt32LE(eocdOffset + 16);

    const index = new Map<string, ZipEntry>();

    // 2. 读中央目录，拿到每个条目的名字和本地头偏移
    for (let position = 0; position < entryCount; position += 1) {
        if (buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
            throw new Error('zip 中央目录损坏');
        }

        const method = buffer.readUInt16LE(cursor + 10);
        const compressedSize = buffer.readUInt32LE(cursor + 20);
        const nameLength = buffer.readUInt16LE(cursor + 28);
        const extraLength = buffer.readUInt16LE(cursor + 30);
        const commentLength = buffer.readUInt16LE(cursor + 32);
        const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
        const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);

        index.set(name, { method, compressedSize, localHeaderOffset });

        cursor += 46 + nameLength + extraLength + commentLength;
    }

    // 3. 逐个读本地头，解出内容
    for (const [name, entry] of index) {
        const local = entry.localHeaderOffset;

        if (buffer.readUInt32LE(local) !== LOCAL_SIGNATURE) {
            throw new Error(`zip 条目损坏：${name}`);
        }

        const nameLength = buffer.readUInt16LE(local + 26);
        const extraLength = buffer.readUInt16LE(local + 28);
        const dataStart = local + 30 + nameLength + extraLength;
        const raw = buffer.subarray(dataStart, dataStart + entry.compressedSize);

        // 0 = 不压缩，8 = deflate
        entries.set(name, entry.method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    }

    return entries;
}
