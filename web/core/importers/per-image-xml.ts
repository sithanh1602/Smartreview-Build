import { applySignals } from './signals.ts';
import { corners, emptyDataset, finite, list, parseXml, sizeOf } from './shared.ts';
import type { SourceFile } from './shared.ts';
import type { ImportOptions, Loose } from './signals.ts';
import type { Annotation, Dataset, Point } from '../schema/types.ts';

// PASCAL VOC and LabelMe both keep one XML per image with <annotation> as its root.
function perImage(
  files: SourceFile[],
  options: ImportOptions,
  format: string,
  fallback: { id: string; name: string },
  read: (
    root: Loose,
    file: string,
  ) => { width?: number; height?: number; objects: Omit<Annotation, 'id' | 'frame_id'>[] },
): Dataset {
  const data = emptyDataset(options, fallback, format);
  const seen = new Set<string>();
  for (const [i, file] of files.entries()) {
    const root = parseXml(file.text, `${format} ${file.name}`).annotation;
    if (!root || !root.filename)
      throw new Error(`${format} ${file.name}: thiếu <annotation> hoặc <filename>.`);
    const name = String(root.filename);
    if (seen.has(name)) throw new Error(`${format}: hai tệp nhãn cùng trỏ tới ảnh ${name}.`);
    seen.add(name);
    const { width, height, objects } = read(root, file.name);
    const size = width && height ? { width, height } : sizeOf(options, name, format);
    const mediaId = `image-${i}`,
      frameId = `${mediaId}:0`;
    data.media.push({ id: mediaId, name, type: 'image', ...size });
    data.frames.push({ id: frameId, media_id: mediaId, index: 0, image: `images/${name}` });
    for (const [n, o] of objects.entries())
      data.annotations.push(
        applySignals({
          ...o,
          id: `${mediaId}-${o.geometry.type === 'bbox' ? 'box' : o.geometry.type}-${n}`,
          frame_id: frameId,
        }),
      );
  }
  if (!data.frames.length) throw new Error(`${format}: không có tệp nhãn nào.`);
  return data;
}

// PASCAL VOC 1.1: <object> with <name> and <bndbox>. CVAT adds <occluded> and <attributes>.
export const importPascalVoc = (files: SourceFile[], options: ImportOptions = {}) =>
  perImage(
    files,
    options,
    'PASCAL VOC',
    { id: 'pascal-voc', name: 'PASCAL VOC annotations' },
    (root, file) => ({
      width: Number(root.size?.width) || undefined,
      height: Number(root.size?.height) || undefined,
      objects: list(root.object).map((o) => {
        if (!o.name || !o.bndbox)
          throw new Error(`PASCAL VOC ${file}: object thiếu <name> hoặc <bndbox>.`);
        const at = (key: string) => finite(o.bndbox[key], `PASCAL VOC ${file} ${key}`);
        return {
          label: String(o.name),
          geometry: corners(at('xmin'), at('ymin'), at('xmax'), at('ymax')),
          source: { kind: 'unknown' as const, name: 'PASCAL VOC' },
          attributes: {
            ...Object.fromEntries(
              ['truncated', 'occluded', 'difficult', 'pose']
                .filter((k) => o[k] != null)
                .map((k) => [k, k === 'pose' ? String(o[k]) : String(o[k]) === '1']),
            ),
            ...Object.fromEntries(
              list(o.attributes?.attribute).map((a) => [String(a.name), a.value ?? '']),
            ),
          },
        };
      }),
    }),
  );

// LabelMe 3.0: <object> with a <polygon> of <pt>; a box is a polygon typed bounding_box.
export const importLabelMe = (files: SourceFile[], options: ImportOptions = {}) =>
  perImage(
    files,
    options,
    'LabelMe',
    { id: 'labelme', name: 'LabelMe annotations' },
    (root, file) => ({
      width: Number(root.imagesize?.ncols) || undefined,
      height: Number(root.imagesize?.nrows) || undefined,
      objects: list(root.object)
        .filter((o) => String(o.deleted ?? '0') !== '1' && o.polygon)
        .map((o) => {
          if (!o.name) throw new Error(`LabelMe ${file}: object thiếu <name>.`);
          const points = list(o.polygon.pt).map(
            (p) => [finite(p.x, `LabelMe ${file} x`), finite(p.y, `LabelMe ${file} y`)] as Point,
          );
          if (points.length < 2)
            throw new Error(`LabelMe ${file}: polygon của “${o.name}” cần ít nhất 2 điểm.`);
          const xs = points.map((p) => p[0]),
            ys = points.map((p) => p[1]);
          return {
            label: String(o.name),
            geometry:
              String(o.type ?? '') === 'bounding_box'
                ? corners(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))
                : {
                    type: points.length > 2 ? ('polygon' as const) : ('polyline' as const),
                    points,
                  },
            source: { kind: 'unknown' as const, name: 'LabelMe' },
            attributes: {
              ...(o.occluded != null && {
                occluded: String(o.occluded) === 'yes' || String(o.occluded) === '1',
              }),
              ...(o.attributes ? { attributes: String(o.attributes) } : {}),
            },
          };
        }),
    }),
  );
