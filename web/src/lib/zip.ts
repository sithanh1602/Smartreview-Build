// Reads a ZIP in the browser, so the server keeps receiving plain files and never unpacks an
// archive. Only stored and deflated entries are read; each is unpacked on demand.
export interface ZipEntry {
  name: string;
  size: number;
  blob(): Promise<Blob>;
}

const view = async (file: Blob, start: number, length: number) =>
  new DataView(await file.slice(start, start + length).arrayBuffer());

export async function readZip(file: Blob): Promise<ZipEntry[]> {
  // The directory record sits at the end, after an optional comment of at most 64 KB.
  const tailStart = Math.max(0, file.size - 65557),
    tail = await view(file, tailStart, 65557);
  let end = tail.byteLength - 22;
  while (end >= 0 && tail.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('Tệp không phải ZIP hợp lệ.');
  const count = tail.getUint16(end + 10, true),
    size = tail.getUint32(end + 12, true),
    offset = tail.getUint32(end + 16, true);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff)
    throw new Error('ZIP64 chưa được hỗ trợ. Dùng tệp nén dưới 4 GB và dưới 65535 tệp.');
  const directory = await view(file, offset, size),
    decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let at = 0, i = 0; i < count; i++) {
    if (at + 46 > directory.byteLength || directory.getUint32(at, true) !== 0x02014b50)
      throw new Error('Mục lục ZIP bị hỏng.');
    const flags = directory.getUint16(at + 8, true),
      method = directory.getUint16(at + 10, true),
      packed = directory.getUint32(at + 20, true),
      unpacked = directory.getUint32(at + 24, true),
      nameLength = directory.getUint16(at + 28, true),
      local = directory.getUint32(at + 42, true);
    const name = decoder.decode(
      new Uint8Array(directory.buffer, directory.byteOffset + at + 46, nameLength),
    );
    at += 46 + nameLength + directory.getUint16(at + 30, true) + directory.getUint16(at + 32, true);
    if (name.endsWith('/')) continue;
    entries.push({
      name,
      size: unpacked,
      async blob() {
        if (flags & 1) throw new Error(`Tệp nén có mật khẩu: ${name}`);
        if (method !== 0 && method !== 8)
          throw new Error(`Kiểu nén chưa được hỗ trợ (${method}): ${name}`);
        const header = await view(file, local, 30);
        if (header.byteLength < 30 || header.getUint32(0, true) !== 0x04034b50)
          throw new Error(`ZIP bị hỏng tại ${name}`);
        const start = local + 30 + header.getUint16(26, true) + header.getUint16(28, true),
          data = file.slice(start, start + packed);
        if (method === 0) return data;
        // The declared size is the limit: an entry that unpacks to more is rejected, not kept.
        const chunks: BlobPart[] = [];
        let total = 0;
        const reader = data
          .stream()
          .pipeThrough(new DecompressionStream('deflate-raw'))
          .getReader();
        for (;;) {
          const { done, value } = await reader.read().catch(() => {
            throw new Error(`Không giải nén được ${name}`);
          });
          if (done) break;
          total += value.byteLength;
          if (total > unpacked) {
            await reader.cancel();
            throw new Error(`Kích thước thực của ${name} lớn hơn khai báo trong ZIP.`);
          }
          chunks.push(value);
        }
        return new Blob(chunks);
      },
    });
  }
  return entries;
}
