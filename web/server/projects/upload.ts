import sharp from 'sharp';
import Busboy from 'busboy';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ReviewError } from '../../shared/review.ts';
import type { Req } from '../types.ts';

export const LIMITS = {
  total: 200 * 1024 * 1024,
  file: 20 * 1024 * 1024,
  annotation: 10 * 1024 * 1024,
  files: 1002,
};
export function safePath(name: unknown) {
  if (
    typeof name !== 'string' ||
    name.length > 240 ||
    /[\\\x00-\x1f<>:"|?*]/.test(name) ||
    name.split('/').some((p) => !p || p === '.' || p === '..' || p.startsWith('.'))
  )
    throw new ReviewError(
      400,
      'Tên file/path không hợp lệ. Không dùng đường dẫn tuyệt đối hoặc ../.',
    );
  return name;
}
export function sameOrigin(req: Req) {
  if (!req.headers.origin) return;
  let origin;
  try {
    origin = new URL(req.headers.origin);
  } catch {
    throw new ReviewError(403, 'Invalid origin.');
  }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== req.headers.host)
    throw new ReviewError(403, 'Cross-origin writes are not allowed.');
}
export async function readJson(req: Req) {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new ReviewError(415, 'Expected application/json.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size <= 16384) chunks.push(c);
  }
  if (size > 16384) throw new ReviewError(413, 'Project metadata quá lớn.');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ReviewError(400, 'Invalid JSON.');
  }
}
export async function receiveUpload(req: Req, directory: string, format: string) {
  if (Number(req.headers['content-length']) > LIMITS.total)
    throw new ReviewError(413, 'Upload tối đa 200 MB.');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  let parser: Busboy.Busboy;
  try {
    parser = Busboy({
      headers: req.headers,
      preservePath: true,
      defParamCharset: 'utf8',
      limits: { fileSize: LIMITS.file, files: LIMITS.files, fields: 0, parts: LIMITS.files },
    });
  } catch {
    throw new ReviewError(400, 'Expected multipart/form-data with annotation and media files.');
  }
  let failure: unknown,
    total = 0,
    annotation: string | undefined,
    metadata: string | undefined;
  const media = new Map<string, string>(),
    writes: Promise<void>[] = [];
  const fail = (e: unknown) => {
    failure ||= e;
  };
  const count = (c: Buffer) => {
    total += c.length;
    if (total > LIMITS.total) parser.destroy(new ReviewError(413, 'Upload tối đa 200 MB.'));
  };
  req.on('data', count);
  parser.on('file', (field, stream, info) => {
    stream.pause();
    stream.on('error', fail);
    try {
      const name = safePath(info.filename);
      const ext = path.extname(name).toLowerCase();
      if (!['annotation', 'media', 'metadata'].includes(field))
        throw new ReviewError(400, 'Unknown upload field.');
      if (field === 'annotation') {
        if (annotation) throw new ReviewError(400, 'Chỉ chọn một annotation file.');
        if (ext !== (format === 'cvat-images' ? '.xml' : '.json'))
          throw new ReviewError(400, 'Annotation extension không khớp format.');
        annotation = path.join(directory, 'annotations', 'source' + ext);
      } else if (field === 'metadata') {
        if (metadata) throw new ReviewError(400, 'Chỉ chọn một file metadata ảnh.');
        if (ext !== '.csv') throw new ReviewError(400, 'Metadata ảnh phải là file CSV.');
        metadata = path.join(directory, 'annotations', 'images.csv');
      } else {
        if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext))
          throw new ReviewError(
            400,
            'Media chỉ hỗ trợ PNG/JPEG/WebP/GIF; không nhận SVG, ZIP hoặc video.',
          );
        if (media.has(name)) throw new ReviewError(400, 'Trùng media filename: ' + name);
        media.set(name, path.join(directory, 'media', name));
      }
      const target = (
        field === 'annotation' ? annotation : field === 'metadata' ? metadata : media.get(name)
      )!;
      stream.on('limit', () => fail(new ReviewError(413, 'Mỗi ảnh tối đa 20 MB.')));
      let bytes = 0;
      stream.on('data', (c: Buffer) => {
        bytes += c.length;
        if (field !== 'media' && bytes > LIMITS.annotation)
          fail(new ReviewError(413, 'Annotation và metadata tối đa 10 MB mỗi file.'));
      });
      writes.push(
        (async () => {
          await fs.mkdir(path.dirname(target), { recursive: true });
          await pipeline(stream, createWriteStream(target, { flags: 'wx', mode: 0o600 }));
        })().catch(fail),
      );
    } catch (e) {
      fail(e);
      stream.resume();
    }
  });
  parser.on('filesLimit', () =>
    fail(new ReviewError(413, 'Tối đa 1000 ảnh, một annotation file và một metadata file.')),
  );
  parser.on('partsLimit', () => fail(new ReviewError(413, 'Quá nhiều upload parts.')));
  parser.on('fieldsLimit', () => fail(new ReviewError(400, 'Unexpected form field.')));
  try {
    await new Promise((resolve, reject) => {
      parser.on('close', resolve);
      parser.on('error', reject);
      req.on('aborted', () => parser.destroy(new ReviewError(400, 'Upload bị ngắt.')));
      req.pipe(parser);
    });
  } catch (e) {
    fail(e instanceof ReviewError ? e : new ReviewError(400, 'Upload không hoàn chỉnh.'));
  } finally {
    req.removeListener('data', count);
    req.unpipe(parser);
    await Promise.all(writes);
  }
  if (failure) throw failure;
  if (!annotation || !media.size)
    throw new ReviewError(400, 'Cần annotation file và ít nhất một ảnh.');
  const dimensions = new Map<string, { width: number; height: number }>();
  for (const [name, file] of media) {
    const handle = await fs.open(file, 'r');
    const head = Buffer.alloc(12);
    try {
      await handle.read(head, 0, 12, 0);
    } finally {
      await handle.close();
    }
    const ext = path.extname(name).toLowerCase();
    const valid =
      ext === '.png'
        ? head.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
        : ['.jpg', '.jpeg'].includes(ext)
          ? head[0] === 255 && head[1] === 216 && head[2] === 255
          : ext === '.webp'
            ? head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP'
            : /^GIF8[79]a/.test(head.toString('ascii', 0, 6));
    if (!valid) throw new ReviewError(400, 'Nội dung ảnh không khớp loại file: ' + name);
    try {
      const image = sharp(file, { limitInputPixels: 25000000, failOn: 'warning' });
      const meta = await image.metadata();
      if ((meta.pages ?? 1) > 1) throw new Error('Animated images unsupported');
      await image.stats(); // Decode the image to reject corrupt/truncated media.
      dimensions.set(name, { width: meta.width, height: meta.height });
    } catch {
      throw new ReviewError(422, 'Ảnh hỏng, ảnh động hoặc vượt 25 megapixels: ' + name);
    }
  }
  return { annotation, media, dimensions, metadata };
}
