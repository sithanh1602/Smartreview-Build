import Busboy from 'busboy';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ReviewError } from '../../shared/review.ts';
import { WAYMO_COMPONENTS, WAYMO_INFO, WAYMO_LIMITS, cameraImage } from '../../shared/waymo.ts';
import { safePath } from '../projects/upload.ts';
import type { WaymoComponent } from '../../shared/waymo.ts';
import type { Req } from '../types.ts';

const TOO_LARGE = 'Upload tối đa 2 GB cho một project 3D.';
// Loose camera images wait here, inside the upload directory but outside every component.
const SHOTS_DIR = '_camera';
const MAGIC = Buffer.from('PAR1');
// A parquet file starts and ends with the same four bytes.
async function isParquet(file: string) {
  const handle = await fs.open(file, 'r');
  try {
    const { size } = await handle.stat();
    if (size < 12) return false;
    const head = Buffer.alloc(4),
      tail = Buffer.alloc(4);
    await handle.read(head, 0, 4, 0);
    await handle.read(tail, 0, 4, size - 4);
    return head.equals(MAGIC) && tail.equals(MAGIC);
  } finally {
    await handle.close();
  }
}
async function isJpeg(file: string) {
  const handle = await fs.open(file, 'r');
  try {
    const head = Buffer.alloc(3);
    await handle.read(head, 0, 3, 0);
    return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  } finally {
    await handle.close();
  }
}
// Receives the parquet files of one Waymo segment into <directory>/<component>/, the layout
// the exporter reads. Each multipart field is named after the component its file belongs to.
// Camera images sent as loose files come in the field `camera`, named <camera>/<frame>.jpg.
export async function receiveSegment(req: Req, directory: string) {
  if (Number(req.headers['content-length']) > WAYMO_LIMITS.total)
    throw new ReviewError(413, TOO_LARGE);
  const maxFiles = WAYMO_COMPONENTS.length * WAYMO_LIMITS.filesPerComponent + WAYMO_LIMITS.images;
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  let parser: Busboy.Busboy;
  try {
    parser = Busboy({
      headers: req.headers,
      preservePath: true,
      defParamCharset: 'utf8',
      limits: { fileSize: WAYMO_LIMITS.total, files: maxFiles, fields: 0, parts: maxFiles },
    });
  } catch {
    throw new ReviewError(400, 'Expected multipart/form-data with the parquet files.');
  }
  let failure: unknown,
    total = 0;
  const received = new Map<WaymoComponent, string[]>(),
    // Loose camera images by the name they were sent under.
    shots = new Map<string, string>(),
    writes: Promise<void>[] = [];
  const fail = (e: unknown) => {
    failure ||= e;
  };
  const count = (c: Buffer) => {
    total += c.length;
    if (total > WAYMO_LIMITS.total) parser.destroy(new ReviewError(413, TOO_LARGE));
  };
  req.on('data', count);
  parser.on('file', (field, stream, info) => {
    stream.pause();
    stream.on('error', fail);
    try {
      if (field === 'camera') {
        const shot = cameraImage(safePath(info.filename));
        if (!shot)
          throw new ReviewError(400, 'Ảnh camera phải là JPEG đặt tên <camera>/<frame>.jpg.');
        const name = `${shot.camera}/${shot.frame}.jpg`;
        if (shots.has(name)) throw new ReviewError(400, 'Trùng ảnh camera: ' + name);
        if (shots.size >= WAYMO_LIMITS.images)
          throw new ReviewError(413, `Quá nhiều ảnh camera (tối đa ${WAYMO_LIMITS.images}).`);
        const target = path.join(directory, SHOTS_DIR, shot.camera, shot.frame + '.jpg');
        shots.set(name, target);
        let bytes = 0;
        stream.on('data', (c: Buffer) => {
          bytes += c.length;
          if (bytes > WAYMO_LIMITS.image)
            fail(new ReviewError(413, 'Mỗi ảnh camera tối đa 20 MB.'));
        });
        stream.on('limit', () => fail(new ReviewError(413, TOO_LARGE)));
        writes.push(
          (async () => {
            await fs.mkdir(path.dirname(target), { recursive: true });
            await pipeline(stream, createWriteStream(target, { flags: 'wx', mode: 0o600 }));
          })().catch(fail),
        );
        return;
      }
      if (!(WAYMO_COMPONENTS as readonly string[]).includes(field))
        throw new ReviewError(400, 'Unknown upload field.');
      const component = field as WaymoComponent;
      const name = path.posix.basename(safePath(info.filename));
      if (!name.toLowerCase().endsWith('.parquet'))
        throw new ReviewError(400, 'Project 3D chỉ nhận tệp .parquet của Waymo Open Dataset v2.');
      const files = received.get(component) ?? [];
      if (files.length >= WAYMO_LIMITS.filesPerComponent)
        throw new ReviewError(413, `Quá nhiều tệp cho ${component}.`);
      const target = path.join(directory, component, name);
      if (files.some((f) => f.toLowerCase() === target.toLowerCase()))
        throw new ReviewError(400, 'Trùng tên tệp: ' + name);
      received.set(component, [...files, target]);
      stream.on('limit', () => fail(new ReviewError(413, TOO_LARGE)));
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
  parser.on('filesLimit', () => fail(new ReviewError(413, 'Quá nhiều tệp.')));
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
  const missing = WAYMO_COMPONENTS.filter((c) => WAYMO_INFO[c].required && !received.has(c));
  if (missing.length) throw new ReviewError(400, `Thiếu tệp parquet của: ${missing.join(', ')}.`);
  for (const files of received.values())
    for (const file of files)
      if (!(await isParquet(file)))
        throw new ReviewError(422, 'Tệp không phải parquet hợp lệ: ' + path.basename(file));
  if (shots.size && received.has('camera_image'))
    throw new ReviewError(
      400,
      'Có cả camera_image lẫn ảnh camera rời. Chỉ dùng một trong hai nguồn ảnh.',
    );
  for (const [name, file] of shots)
    if (!(await isJpeg(file))) throw new ReviewError(422, 'Ảnh camera không phải JPEG: ' + name);
  return { components: received, shots };
}
