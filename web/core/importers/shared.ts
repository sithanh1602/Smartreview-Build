import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { ImportOptions, Loose } from './signals.ts';
import type { Dataset, Geometry, Point } from '../schema/types.ts';

// Helpers of the importers in this folder that also run in the browser, where the form reads a
// dataset before uploading it. Nothing here may import the schema validator: it loads its
// schema from disk.

// One file of an annotation set, named by its path inside the export.
export interface SourceFile {
  name: string;
  text: string;
}
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
export const list = (value: unknown): Loose[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];
export const extension = (name: string) => {
  const base = name.slice(name.lastIndexOf('/') + 1),
    dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot).toLowerCase();
};
export const stem = (name: string) =>
  extension(name) ? name.slice(0, name.length - extension(name).length) : name;
export const baseName = (name: string) => name.slice(name.lastIndexOf('/') + 1);
export const pad = (n: number) => String(n).padStart(6, '0');

export function emptyDataset(
  { id, name }: ImportOptions,
  fallback: { id: string; name: string },
  source: string,
): Dataset {
  return {
    schema_version: '1.0.0',
    dataset: {
      id: id ?? fallback.id,
      name: name ?? fallback.name,
      source: { kind: 'import', name: source },
    },
    media: [],
    frames: [],
    annotations: [],
  };
}
// The size of an image the format does not state.
export function sizeOf(options: ImportOptions, image: string, format: string) {
  const size = options.sizes?.(image);
  if (!size)
    throw new Error(
      `${format} không ghi kích thước ảnh nên cần chính ảnh đó: không tìm thấy ảnh cho “${image}”.`,
    );
  // Only the size: callers spread it into a medium of their own.
  return { width: size.width, height: size.height };
}
export function parseXml(xml: string, what: string): Loose {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DTD/entity declarations are not supported');
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error(`${what}: XML không hợp lệ (${valid.err.msg}).`);
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseTagValue: false,
    processEntities: true,
  }).parse(xml);
}
// "x1,y1;x2,y2" as CVAT writes the points of a polygon or polyline.
export const cvatPoints = (points: unknown): Point[] =>
  String(points)
    .split(';')
    .map((pair) => pair.split(',').map(Number) as Point);
export const corners = (x1: number, y1: number, x2: number, y2: number): Geometry => ({
  type: 'bbox',
  x: x1,
  y: y1,
  width: x2 - x1,
  height: y2 - y1,
});
export const cvatSource = (source: unknown) => ({
  kind:
    source === 'manual'
      ? ('human' as const)
      : source === 'auto'
        ? ('model' as const)
        : ('unknown' as const),
  name: 'CVAT',
});
export function finite(value: unknown, what: string) {
  const n = Number(value);
  if (value === '' || value == null || !Number.isFinite(n))
    throw new Error(`${what}: “${value}” không phải số.`);
  return n;
}
