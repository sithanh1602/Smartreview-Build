import type { Writable } from 'node:stream';

const TABLE = new Uint32Array(256).map((_, i) => {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (const byte of data) c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
// Without ZIP64 an archive holds at most 65535 files and 4 GiB.
export const ZIP_MAX_FILES = 65535;
const ZIP_MAX_BYTES = 0xffffffff;

// Writes a ZIP to `out` one file at a time, uncompressed (images are compressed already), so
// a whole dataset never sits in memory. Call add() for each file, then end().
export class ZipWriter {
  out: Writable;
  offset = 0;
  directory: Buffer[] = [];
  constructor(out: Writable) {
    this.out = out;
  }
  async write(chunk: Uint8Array) {
    this.offset += chunk.length;
    if (this.offset > ZIP_MAX_BYTES) throw new Error('ZIP larger than 4 GiB');
    if (!this.out.write(chunk)) await new Promise((resolve) => this.out.once('drain', resolve));
  }
  async add(name: string, data: Uint8Array) {
    if (this.directory.length >= ZIP_MAX_FILES) throw new Error('Too many files for a ZIP');
    const file = Buffer.from(name, 'utf8'),
      crc = crc32(data),
      at = this.offset;
    // Shared by the local header (from "version needed") and the central directory entry:
    // version 2.0, UTF-8 names, stored, a fixed date (1980-01-01), CRC, both sizes, name length.
    const common = Buffer.alloc(26);
    common.writeUInt16LE(20, 0);
    common.writeUInt16LE(0x0800, 2);
    common.writeUInt16LE(0, 4);
    common.writeUInt16LE(0, 6);
    common.writeUInt16LE(0x21, 8);
    common.writeUInt32LE(crc, 10);
    common.writeUInt32LE(data.length, 14);
    common.writeUInt32LE(data.length, 18);
    common.writeUInt16LE(file.length, 22);
    const local = Buffer.alloc(4);
    local.writeUInt32LE(0x04034b50);
    await this.write(Buffer.concat([local, common, file]));
    await this.write(data);
    const central = Buffer.alloc(6);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    // Comment length, disk number, internal and external attributes, then the header offset.
    const tail = Buffer.alloc(14);
    tail.writeUInt32LE(at, 10);
    this.directory.push(Buffer.concat([central, common, tail, file]));
  }
  async end() {
    const start = this.offset,
      directory = Buffer.concat(this.directory);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50);
    end.writeUInt16LE(this.directory.length, 8);
    end.writeUInt16LE(this.directory.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(start, 16);
    await this.write(directory);
    await this.write(end);
  }
}
