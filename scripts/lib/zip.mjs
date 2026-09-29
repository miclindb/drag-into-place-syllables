// Minimal, dependency-free ZIP writer and reader. Entries are stored
// uncompressed (method 0), which the Curious Reader spec recommends because it
// extracts fastest on low-end devices. Timestamps are fixed so identical input
// always produces a byte-identical archive.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01
const UTF8_FLAG = 0x0800;
const VERSION_NEEDED = 20;
const VERSION_MADE_BY = (3 << 8) | 20; // Unix, so the permission bits below apply.
const FILE_ATTRS = (0o100644 << 16) >>> 0;
const DIR_ATTRS = ((0o040755 << 16) | 0x10) >>> 0;

/**
 * `entries`: `[{ name, data }]`. Names use `/` separators and must be relative;
 * a name ending in `/` (with no data) is a directory entry.
 */
export function createZip(entries) {
  if (entries.length > 0xffff) throw new Error("too many ZIP entries (ZIP64 is not supported)");
  const locals = [];
  const centrals = [];
  let offset = 0;
  const seen = new Set();
  for (const { name, data = Buffer.alloc(0) } of entries) {
    if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) {
      throw new Error(`invalid ZIP entry name: ${name}`);
    }
    if (seen.has(name)) throw new Error(`duplicate ZIP entry: ${name}`);
    seen.add(name);
    const isDir = name.endsWith("/");
    const nameBytes = Buffer.from(name, "utf8");
    const body = isDir ? Buffer.alloc(0) : Buffer.from(data);
    const crc = crc32(body);
    if (offset + body.length > 0xffffffff) throw new Error("ZIP too large (ZIP64 is not supported)");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(VERSION_MADE_BY, 4);
    central.writeUInt16LE(VERSION_NEEDED, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(isDir ? DIR_ATTRS : FILE_ATTRS, 38);
    central.writeUInt32LE(offset, 42);

    locals.push(local, nameBytes, body);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + body.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, end]);
}

/** Reads a stored (method 0) ZIP back into `[{ name, data }]`, verifying CRCs. */
export function readZip(buffer) {
  const endOffset = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endOffset < 0) throw new Error("not a ZIP file: end of central directory not found");
  const count = buffer.readUInt16LE(endOffset + 10);
  let pointer = buffer.readUInt32LE(endOffset + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) throw new Error("corrupt central directory");
    const method = buffer.readUInt16LE(pointer + 10);
    const crc = buffer.readUInt32LE(pointer + 16);
    const size = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString("utf8", pointer + 46, pointer + 46 + nameLength);
    if (method !== 0) throw new Error(`${name}: only stored entries are supported`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(start, start + size);
    if (crc32(data) !== crc) throw new Error(`${name}: CRC mismatch`);
    entries.push({ name, data });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
