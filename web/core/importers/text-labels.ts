import { baseName, corners, emptyDataset, extension, finite, pad, sizeOf, stem } from './shared.ts';
import type { SourceFile } from './shared.ts';
import type { ImportOptions } from './signals.ts';
import type { Point } from '../schema/types.ts';

const rows = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

// Class names of a YOLO export: obj.names / classes.txt (one per line) or the `names:` entry
// of an Ultralytics data.yaml, written as a list or as an index → name map.
export function yoloNames(files: SourceFile[]): string[] {
  const plain = files.find((f) => /(^|\/)(obj\.names|classes\.txt|[^/]+\.names)$/i.test(f.name));
  if (plain) return rows(plain.text);
  const yaml = files.find((f) => ['.yaml', '.yml'].includes(extension(f.name)));
  if (!yaml) return [];
  const at = yaml.text.search(/^names\s*:/m);
  if (at < 0) return [];
  const body = yaml.text.slice(at).replace(/^names\s*:/, '');
  const inline = body.match(/^\s*\[([^\]]*)\]/);
  const clean = (v: string) => v.trim().replace(/^['"]|['"]$/g, '');
  if (inline) return inline[1].split(',').map(clean).filter(Boolean);
  const names: string[] = [];
  for (const line of body.split(/\r?\n/).slice(1)) {
    const item = line.match(/^\s+-\s*(.+)$/),
      pair = line.match(/^\s+(\d+)\s*:\s*(.+)$/);
    if (item) names.push(clean(item[1]));
    else if (pair) names[Number(pair[1])] = clean(pair[2]);
    else if (line.trim() && !/^\s/.test(line)) break;
  }
  return names;
}
// Files of a YOLO export that list images or settings instead of holding labels.
export const yoloLabelFile = (name: string) =>
  extension(name) === '.txt' &&
  !/(^|\/)(classes|train|val|valid|test|trainval|obj|labels)\.txt$/i.test(name) &&
  !/(^|\/)readme[^/]*$/i.test(name);

// YOLO 1.1 and Ultralytics YOLO: one .txt per image, a line per object with coordinates as
// fractions of the image. Five numbers are a box, six a box with its confidence, more a polygon.
export function importYolo(files: SourceFile[], options: ImportOptions = {}) {
  const names = yoloNames(files);
  const data = emptyDataset(options, { id: 'yolo', name: 'YOLO annotations' }, 'YOLO');
  const labelFiles = files.filter((f) => yoloLabelFile(f.name));
  if (!labelFiles.length) throw new Error('YOLO: không có tệp nhãn .txt nào.');
  const bases = new Map<string, number>();
  for (const f of labelFiles) bases.set(baseName(f.name), (bases.get(baseName(f.name)) ?? 0) + 1);
  for (const [i, file] of labelFiles.entries()) {
    // labels/train/a.txt belongs to images/train/a.<ext>; a unique file name is enough.
    const image =
      bases.get(baseName(file.name)) === 1
        ? stem(baseName(file.name))
        : stem(file.name).replace(/(^|\/)labels(\/|$)/, '$1images$2');
    const { width, height } = sizeOf(options, image, 'YOLO');
    const mediaId = `image-${i}`,
      frameId = `${mediaId}:0`;
    data.media.push({ id: mediaId, name: image, type: 'image', width, height });
    data.frames.push({ id: frameId, media_id: mediaId, index: 0, image: `images/${image}` });
    for (const [n, line] of rows(file.text).entries()) {
      const v = line.split(/\s+/).map((t) => finite(t, `YOLO ${file.name} dòng ${n + 1}`));
      if (v.length < 5) throw new Error(`YOLO ${file.name} dòng ${n + 1}: cần ít nhất 5 số.`);
      const label = names[v[0]] ?? `class_${v[0]}`;
      const box = v.length <= 6;
      // A polygon is a class and pairs of numbers; one number left over is its confidence.
      const confidence =
        v.length === 6 ? v[5] : !box && v.length % 2 === 0 ? v[v.length - 1] : undefined;
      const flat = box ? [] : v.slice(1, confidence === undefined ? undefined : -1);
      data.annotations.push({
        id: `${mediaId}-${box ? 'box' : 'polygon'}-${n}`,
        frame_id: frameId,
        label,
        geometry: box
          ? {
              type: 'bbox',
              x: (v[1] - v[3] / 2) * width,
              y: (v[2] - v[4] / 2) * height,
              width: v[3] * width,
              height: v[4] * height,
            }
          : {
              type: 'polygon',
              points: Array.from({ length: flat.length >> 1 }, (_, k) => [
                flat[2 * k] * width,
                flat[2 * k + 1] * height,
              ]) as Point[],
            },
        ...(confidence !== undefined && confidence >= 0 && confidence <= 1 && { confidence }),
        source: { kind: confidence === undefined ? 'unknown' : 'model', name: 'YOLO' },
        attributes: { class_id: v[0] },
      });
    }
  }
  return data;
}

// KITTI object labels: one .txt per image; a line is
// type truncated occluded alpha x1 y1 x2 y2 h w l x y z rotation_y [score], in pixels.
export function importKitti(files: SourceFile[], options: ImportOptions = {}) {
  const data = emptyDataset(options, { id: 'kitti', name: 'KITTI annotations' }, 'KITTI');
  const labelFiles = files.filter((f) => extension(f.name) === '.txt');
  if (!labelFiles.length) throw new Error('KITTI: không có tệp nhãn .txt nào.');
  for (const [i, file] of labelFiles.entries()) {
    const image = stem(baseName(file.name));
    const size = sizeOf(options, image, 'KITTI');
    const mediaId = `image-${i}`,
      frameId = `${mediaId}:0`;
    data.media.push({ id: mediaId, name: image, type: 'image', ...size });
    data.frames.push({ id: frameId, media_id: mediaId, index: 0, image: `images/${image}` });
    for (const [n, line] of rows(file.text).entries()) {
      const t = line.split(/\s+/);
      if (t.length < 8) throw new Error(`KITTI ${file.name} dòng ${n + 1}: cần ít nhất 8 cột.`);
      if (t[0] === 'DontCare') continue;
      const at = (k: number) => finite(t[k], `KITTI ${file.name} dòng ${n + 1}`);
      const score = t.length >= 16 ? Number(t[15]) : undefined;
      data.annotations.push({
        id: `${mediaId}-box-${n}`,
        frame_id: frameId,
        label: t[0],
        geometry: corners(at(4), at(5), at(6), at(7)),
        ...(score !== undefined && score >= 0 && score <= 1 && { confidence: score }),
        source: { kind: score === undefined ? 'unknown' : 'model', name: 'KITTI' },
        attributes: { truncated: at(1), occluded: at(2) },
      });
    }
  }
  return data;
}

// MOT 1.1 ground truth: gt.txt with frame,track,x,y,width,height,kept,class,visibility per
// line, class names in labels.txt, and images named by frame number (img1/000001.jpg).
export function importMot(files: SourceFile[], options: ImportOptions = {}) {
  const gt =
    files.find((f) => /(^|\/)gt\.txt$/i.test(f.name)) ??
    files.find((f) => extension(f.name) === '.txt' && !/(^|\/)labels\.txt$/i.test(f.name));
  if (!gt) throw new Error('MOT: không có gt.txt.');
  const labels = rows(files.find((f) => /(^|\/)labels\.txt$/i.test(f.name))?.text ?? '');
  const data = emptyDataset(options, { id: 'mot', name: 'MOT annotations' }, 'MOT 1.1');
  const image = (frame: number) => `images/${pad(frame)}`;
  const used = new Set<number>();
  for (const [n, line] of rows(gt.text).entries()) {
    const v = line.split(',').map((t) => finite(t.trim(), `MOT ${gt.name} dòng ${n + 1}`));
    if (v.length < 6) throw new Error(`MOT ${gt.name} dòng ${n + 1}: cần ít nhất 6 cột.`);
    // The seventh column of ground truth marks a row to ignore with 0.
    if (v.length > 6 && v[6] === 0) continue;
    const [frame, track] = v;
    if (!Number.isSafeInteger(frame) || frame < 0)
      throw new Error(`MOT ${gt.name} dòng ${n + 1}: số khung hình không hợp lệ.`);
    used.add(frame);
    data.annotations.push({
      id: `track-${track}-frame-${frame}`,
      object_id: `track-${track}`,
      frame_id: `video:${frame}`,
      track_id: String(track),
      label:
        v.length > 7 && v[7] > 0 ? (labels[v[7] - 1] ?? `class_${v[7]}`) : (labels[0] ?? 'object'),
      geometry: { type: 'bbox', x: v[2], y: v[3], width: v[4], height: v[5] },
      source: { kind: 'unknown', name: 'MOT' },
      attributes: v.length > 8 ? { visibility: v[8] } : {},
    });
  }
  if (!used.size) throw new Error('MOT: gt.txt không có dòng nào dùng được.');
  const frames = [...used].sort((a, b) => a - b);
  const size = sizeOf(options, image(frames[0]).slice('images/'.length), 'MOT');
  data.media.push({ id: 'video', name: 'sequence', type: 'video', ...size });
  for (const frame of frames)
    data.frames.push({
      id: `video:${frame}`,
      media_id: 'video',
      index: frame,
      image: image(frame),
    });
  return data;
}
