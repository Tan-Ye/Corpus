/** 简易 ZIP 写入器：只做 store（不压缩），够备份源文件用 */
export interface ZipEntry {
    name: string;
    data: Buffer;
}

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
/** 文件名用 UTF-8：中文文件名必须置这个位，否则解压出来是乱码 */
const UTF8_FLAG = 0x0800;

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);

    for (let index = 0; index < 256; index += 1) {
        let value = index;

        for (let bit = 0; bit < 8; bit += 1) {
            value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }

        table[index] = value >>> 0;
    }

    return table;
})();

function crc32(buffer: Buffer): number {
    let crc = 0xffffffff;

    for (const byte of buffer) {
        crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
}

/**
 * 生成 zip。
 *
 * 不压缩（method=0）：备份的是 PDF/Word 这类本来压过的文件，
 * 再 deflate 一遍收益很小，换来的是实现复杂度和 CPU 开销。
 */
export function createZip(entries: ZipEntry[]): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
        const name = Buffer.from(entry.name.replaceAll('\\', '/'), 'utf8');
        const crc = crc32(entry.data);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(LOCAL_SIGNATURE, 0);
        local.writeUInt16LE(20, 4); // version needed
        local.writeUInt16LE(UTF8_FLAG, 6);
        local.writeUInt16LE(0, 8); // method: store
        local.writeUInt16LE(0, 10); // time
        local.writeUInt16LE(0, 12); // date
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(entry.data.length, 18);
        local.writeUInt32LE(entry.data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);

        localParts.push(local, name, entry.data);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
        central.writeUInt16LE(20, 4); // version made by
        central.writeUInt16LE(20, 6); // version needed
        central.writeUInt16LE(UTF8_FLAG, 8);
        central.writeUInt16LE(0, 10); // method
        central.writeUInt16LE(0, 12); // time
        central.writeUInt16LE(0, 14); // date
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(entry.data.length, 20);
        central.writeUInt32LE(entry.data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt16LE(0, 30); // extra
        central.writeUInt16LE(0, 32); // comment
        central.writeUInt16LE(0, 34); // disk
        central.writeUInt16LE(0, 36); // internal attrs
        central.writeUInt32LE(0, 38); // external attrs
        central.writeUInt32LE(offset, 42);

        centralParts.push(central, name);
        offset += 30 + name.length + entry.data.length;
    }

    const centralDirectory = Buffer.concat(centralParts);

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
    eocd.writeUInt16LE(0, 4); // disk
    eocd.writeUInt16LE(0, 6); // cd disk
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralDirectory.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20); // comment

    return Buffer.concat([...localParts, centralDirectory, eocd]);
}
