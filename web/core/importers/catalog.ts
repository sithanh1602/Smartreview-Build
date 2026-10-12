import { importCvatVideo } from './cvat-video.ts';
import { importDatumaro } from './datumaro.ts';
import { importLabelMe, importPascalVoc } from './per-image-xml.ts';
import { importKitti, importMot, importYolo, yoloLabelFile } from './text-labels.ts';
import { IMAGE_EXTENSIONS, baseName, extension, stem } from './shared.ts';
import type { SourceFile } from './shared.ts';
import type { ImportOptions } from './signals.ts';
import type { Dataset } from '../schema/types.ts';

// What is known about the import formats without the schema validator, so that the browser can
// use it too: which formats exist, how to tell them apart, how to read the newer ones and how
// a frame finds its image. ./formats.ts adds validation and the older importers for the server.
export type { SourceFile } from './shared.ts';
export type FormatId =
  | 'cvat-images'
  | 'cvat-video'
  | 'coco-detection'
  | 'datumaro'
  | 'pascal-voc'
  | 'yolo'
  | 'labelme'
  | 'kitti'
  | 'mot'
  | 'smartreview-json';
export interface FormatInfo {
  label: string;
  // Extensions of the files an annotation set of this format is made of.
  extensions: string[];
  // Whether the set is several files (one per image, or labels plus a class list).
  multiple: boolean;
}
// The order is the order of the format menu: CVAT's own formats first.
export const FORMAT_INFO: Record<FormatId, FormatInfo> = {
  'cvat-images': { label: 'CVAT for images 1.1 · XML', extensions: ['.xml'], multiple: false },
  'cvat-video': { label: 'CVAT for video 1.1 · XML', extensions: ['.xml'], multiple: false },
  'coco-detection': {
    label: 'COCO Detection · JSON (bbox)',
    extensions: ['.json'],
    multiple: false,
  },
  datumaro: { label: 'Datumaro 1.0 · JSON', extensions: ['.json'], multiple: false },
  'pascal-voc': { label: 'PASCAL VOC 1.1 · XML mỗi ảnh', extensions: ['.xml'], multiple: true },
  yolo: {
    label: 'YOLO 1.1 / Ultralytics YOLO · TXT mỗi ảnh',
    extensions: ['.txt', '.names', '.yaml', '.yml'],
    multiple: true,
  },
  labelme: { label: 'LabelMe 3.0 · XML mỗi ảnh', extensions: ['.xml'], multiple: true },
  kitti: { label: 'KITTI · TXT mỗi ảnh', extensions: ['.txt'], multiple: true },
  mot: { label: 'MOT 1.1 · gt.txt', extensions: ['.txt'], multiple: true },
  'smartreview-json': {
    label: 'SmartReview Schema 1.0.0 · JSON',
    extensions: ['.json'],
    multiple: false,
  },
};
export const isFormat = (format: unknown): format is FormatId =>
  typeof format === 'string' && Object.hasOwn(FORMAT_INFO, format);
// Formats whose frames name images as the export does, under "images/".
export const namesImages = (format: string) => format !== 'smartreview-json';

const one =
  (read: (text: string, options?: ImportOptions) => Dataset) =>
  (files: SourceFile[], options?: ImportOptions) => {
    if (files.length !== 1) throw new Error('Định dạng này cần đúng một tệp nhãn.');
    return read(files[0].text, options);
  };
// Readers that build a dataset without validating it against the schema.
export const PARSERS: Partial<
  Record<FormatId, (files: SourceFile[], options?: ImportOptions) => Dataset>
> = {
  'cvat-video': one(importCvatVideo),
  datumaro: one(importDatumaro),
  'pascal-voc': importPascalVoc,
  yolo: importYolo,
  labelme: importLabelMe,
  kitti: importKitti,
  mot: importMot,
};

const firstRow = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#')) ?? '';
// Which annotation sets a pile of text files holds, judged by content rather than by name.
// A single-file format gives one candidate per file; a per-image format gives one candidate
// made of all its files.
export function detectFormats(files: SourceFile[]): { format: FormatId; files: SourceFile[] }[] {
  const found: { format: FormatId; files: SourceFile[] }[] = [];
  const groups: Partial<Record<FormatId, SourceFile[]>> = {};
  const add = (format: FormatId, file: SourceFile) => (groups[format] ??= []).push(file);
  const emptyText: SourceFile[] = [];
  for (const file of files) {
    const ext = extension(file.name),
      { text } = file;
    if (ext === '.xml') {
      if (/<annotations[\s>]/.test(text) && /<version>\s*1\.1\s*<\/version>/.test(text))
        found.push({
          format: /<track[\s>]/.test(text) ? 'cvat-video' : 'cvat-images',
          files: [file],
        });
      else if (/<annotation[\s>]/.test(text) && /<filename[\s>]/.test(text))
        add(/<imagesize[\s>]|<polygon[\s>]/.test(text) ? 'labelme' : 'pascal-voc', file);
    } else if (ext === '.json') {
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        continue;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
      if (Array.isArray(data.items) && data.categories && typeof data.categories === 'object')
        found.push({ format: 'datumaro', files: [file] });
      else if (
        Array.isArray(data.annotations) &&
        Array.isArray(data.images) &&
        Array.isArray(data.categories)
      )
        found.push({ format: 'coco-detection', files: [file] });
      else if (
        Array.isArray(data.annotations) &&
        typeof data.schema_version === 'string' &&
        Array.isArray(data.frames)
      )
        found.push({ format: 'smartreview-json', files: [file] });
    } else if (ext === '.txt') {
      const row = firstRow(text);
      if (/(^|\/)gt\.txt$/i.test(file.name) && /^\d+\s*,\s*-?\d+\s*,/.test(row)) add('mot', file);
      else if (/(^|\/)labels\.txt$/i.test(file.name)) add('mot', file);
      else if (!yoloLabelFile(file.name)) add('yolo', file);
      else if (!row) emptyText.push(file);
      else if (/^\d+(\s+-?(\d+\.?\d*|\.\d+)(e-?\d+)?){4,}$/i.test(row)) add('yolo', file);
      else if (row.split(/\s+/).length >= 8 && Number.isNaN(Number(row.split(/\s+/)[0])))
        add('kitti', file);
    } else if (['.names', '.yaml', '.yml'].includes(ext)) add('yolo', file);
  }
  // An image without objects has an empty label file, which says nothing about its format.
  const text = (['yolo', 'kitti'] as const).find((f) =>
    groups[f]?.some((file) => yoloLabelFile(file.name) && firstRow(file.text)),
  );
  if (text) groups[text]!.push(...emptyText);
  for (const format of ['pascal-voc', 'yolo', 'labelme', 'kitti', 'mot'] as const) {
    const members = groups[format];
    if (!members) continue;
    const labels =
      format === 'mot'
        ? members.filter((f) => /(^|\/)gt\.txt$/i.test(f.name))
        : format === 'yolo'
          ? members.filter((f) => yoloLabelFile(f.name))
          : members;
    if (labels.length) found.push({ format, files: members });
  }
  return found;
}

// Finds the uploaded image a frame refers to. Exports disagree on folders, and several
// formats (YOLO, KITTI, MOT, CVAT for video) name an image without its extension, so the
// search goes from the exact path to a unique file name, then the same without extensions.
export function imageResolver(names: Iterable<string>) {
  const all = [...names];
  const exact = new Set(all);
  const group = (key: (name: string) => string) => {
    const map = new Map<string, string[]>();
    for (const name of all) map.set(key(name), [...(map.get(key(name)) ?? []), name]);
    return map;
  };
  const byBase = group(baseName),
    byStem = group(stem),
    byStemBase = group((n) => stem(baseName(n)));
  const only = (list: string[] | undefined) => (list?.length === 1 ? list[0] : null);
  return (reference: string): string | null => {
    if (exact.has(reference)) return reference;
    const named = only(byBase.get(baseName(reference)));
    if (named || IMAGE_EXTENSIONS.includes(extension(reference))) return named;
    return only(byStem.get(reference)) ?? only(byStemBase.get(baseName(reference)));
  };
}
