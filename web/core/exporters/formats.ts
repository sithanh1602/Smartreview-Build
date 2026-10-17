import { exportCvatImages } from './cvat-images.ts';
import type { Annotation, Dataset, Geometry, Media, Rect } from '../schema/types.ts';

// The image formats a dataset of separate images can be written in, each as the files its
// importer in ../importers reads back. Video formats (CVAT for video, MOT) need a video.
export const EXPORT_FORMATS = {
  'cvat-images': {
    label: 'CVAT for images 1.1 · XML',
    keeps: 'Box, polygon, polyline',
  },
  'coco-detection': {
    label: 'COCO Detection · JSON',
    keeps: 'Box; polygon và polyline thành khung bao (polygon giữ thêm segmentation)',
  },
  datumaro: { label: 'Datumaro 1.0 · JSON', keeps: 'Box, polygon, polyline' },
  'pascal-voc': {
    label: 'PASCAL VOC 1.1 · XML mỗi ảnh',
    keeps: 'Box; polygon và polyline thành khung bao',
  },
  yolo: {
    label: 'Ultralytics YOLO · TXT mỗi ảnh',
    keeps: 'Box, polygon; polyline thành khung bao',
  },
  labelme: {
    label: 'LabelMe 3.0 · XML mỗi ảnh',
    keeps: 'Box, polygon; polyline nhiều điểm đọc lại thành polygon',
  },
  kitti: {
    label: 'KITTI · TXT mỗi ảnh',
    keeps: 'Box; polygon và polyline thành khung bao; dấu cách trong tên nhãn thành “_”',
  },
  'smartreview-json': { label: 'SmartReview Schema 1.0.0 · JSON', keeps: 'Mọi nhãn và thuộc tính' },
} as const;
export type ExportFormat = keyof typeof EXPORT_FORMATS;
export const isExportFormat = (format: unknown): format is ExportFormat =>
  typeof format === 'string' && Object.hasOwn(EXPORT_FORMATS, format);

export interface Export {
  // Annotation files, by their path inside the archive.
  files: { path: string; text: string }[];
  // Where the image of a medium goes in the archive.
  image: (media: Media) => string;
  // Annotations the format has no place for (masks, cuboids).
  skipped: number;
}

const escape = (value: unknown) =>
  String(value).replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
const n = (value: number) => Number(value.toFixed(2));
// A relative path that cannot leave the archive's folder.
export const safePath = (name: string) =>
  name
    .split(/[\\/]+/)
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
const stem = (path: string) => path.replace(/\.[^./]+$/, '');
// The box around a box, polygon or polyline; null for geometry without one in the image.
function boundsOf(g: Geometry): Rect | null {
  if (g.type === 'bbox') return g;
  if (g.type !== 'polygon' && g.type !== 'polyline') return null;
  const xs = g.points.map((p) => p[0]),
    ys = g.points.map((p) => p[1]);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
const flat = (points: [number, number][]) => points.flatMap(([x, y]) => [n(x), n(y)]);

// Each image with its annotations, in frame order.
function images(dataset: Dataset) {
  const media = new Map(dataset.media.map((m) => [m.id, m]));
  const byFrame = new Map<string, Annotation[]>();
  for (const a of dataset.annotations)
    byFrame.set(a.frame_id, [...(byFrame.get(a.frame_id) ?? []), a]);
  return dataset.frames.map((frame) => {
    const m = media.get(frame.media_id)!;
    if (m.type !== 'image') throw new Error('Định dạng ảnh không chứa được frame của video.');
    return { media: m, name: safePath(m.name), annotations: byFrame.get(frame.id) ?? [] };
  });
}
const labelsOf = (dataset: Dataset) => [...new Set(dataset.annotations.map((a) => a.label))].sort();

export function exportDataset(format: ExportFormat, dataset: Dataset): Export {
  const list = images(dataset);
  const labels = labelsOf(dataset);
  const labelIndex = new Map(labels.map((l, i) => [l, i]));
  let skipped = 0;
  // The box of each annotation, or a skip when the format cannot hold it.
  const box = (a: Annotation) => {
    const r = boundsOf(a.geometry);
    if (!r) skipped++;
    return r;
  };
  const under = (folder: string) => (m: Media) => `${folder}/${safePath(m.name)}`;
  switch (format) {
    case 'cvat-images': {
      const { xml, skipped } = exportCvatImages(dataset);
      return { files: [{ path: 'annotations.xml', text: xml }], image: under('images'), skipped };
    }
    case 'coco-detection': {
      let id = 0;
      const annotations = list.flatMap(({ annotations }, i) =>
        annotations.flatMap((a) => {
          const r = box(a);
          if (!r) return [];
          return [
            {
              id: ++id,
              image_id: i + 1,
              category_id: labelIndex.get(a.label)! + 1,
              bbox: [n(r.x), n(r.y), n(r.width), n(r.height)],
              area: n(r.width * r.height),
              iscrowd: 0,
              segmentation: a.geometry.type === 'polygon' ? [flat(a.geometry.points)] : [],
            },
          ];
        }),
      );
      const coco = {
        info: { description: dataset.dataset.name },
        licenses: [],
        categories: labels.map((name, i) => ({ id: i + 1, name, supercategory: '' })),
        images: list.map(({ media, name }, i) => ({
          id: i + 1,
          file_name: name,
          width: media.width,
          height: media.height,
        })),
        annotations,
      };
      return {
        files: [
          { path: 'annotations/instances_default.json', text: JSON.stringify(coco, null, 2) },
        ],
        image: under('images'),
        skipped,
      };
    }
    case 'datumaro': {
      const items = list.map(({ media, name, annotations }) => ({
        id: stem(name),
        annotations: annotations.flatMap((a, k): Record<string, unknown>[] => {
          const g = a.geometry,
            common = { id: k, label_id: labelIndex.get(a.label)!, group: 0, z_order: 0 };
          if (g.type === 'bbox')
            return [{ ...common, type: 'bbox', bbox: [n(g.x), n(g.y), n(g.width), n(g.height)] }];
          if (g.type === 'polygon' || g.type === 'polyline')
            return [{ ...common, type: g.type, points: flat(g.points) }];
          skipped++;
          return [];
        }),
        image: { path: name, size: [media.height, media.width] },
      }));
      const doc = {
        info: {},
        categories: {
          label: { labels: labels.map((name) => ({ name, parent: '', attributes: [] })) },
        },
        items,
      };
      return {
        files: [{ path: 'annotations/default.json', text: JSON.stringify(doc, null, 2) }],
        image: under('images'),
        skipped,
      };
    }
    case 'pascal-voc':
      return {
        files: list.map(({ media, name, annotations }) => ({
          path: `Annotations/${stem(name)}.xml`,
          text: [
            '<annotation>',
            '  <folder></folder>',
            `  <filename>${escape(name)}</filename>`,
            `  <size><width>${media.width}</width><height>${media.height}</height><depth>3</depth></size>`,
            '  <segmented>0</segmented>',
            ...annotations.flatMap((a) => {
              const r = box(a);
              if (!r) return [];
              return [
                '  <object>',
                `    <name>${escape(a.label)}</name>`,
                '    <truncated>0</truncated>',
                '    <difficult>0</difficult>',
                `    <bndbox><xmin>${n(r.x)}</xmin><ymin>${n(r.y)}</ymin><xmax>${n(r.x + r.width)}</xmax><ymax>${n(r.y + r.height)}</ymax></bndbox>`,
                '  </object>',
              ];
            }),
            '</annotation>',
            '',
          ].join('\n'),
        })),
        image: under('JPEGImages'),
        skipped,
      };
    case 'yolo': {
      const files = list.map(({ media, name, annotations }) => ({
        path: `labels/train/${stem(name)}.txt`,
        text: annotations
          .flatMap((a) => {
            const g = a.geometry,
              c = labelIndex.get(a.label)!;
            const fx = (x: number) => (x / media.width).toFixed(6),
              fy = (y: number) => (y / media.height).toFixed(6);
            if (g.type === 'polygon' && g.points.length >= 3)
              return [[c, ...g.points.flatMap(([x, y]) => [fx(x), fy(y)])].join(' ')];
            const r = box(a);
            if (!r) return [];
            return [
              [c, fx(r.x + r.width / 2), fy(r.y + r.height / 2), fx(r.width), fy(r.height)].join(
                ' ',
              ),
            ];
          })
          .map((line) => line + '\n')
          .join(''),
      }));
      const yaml = [
        'path: .',
        'train: train.txt',
        'names:',
        ...labels.map((l, i) => `  ${i}: ${JSON.stringify(l)}`),
        '',
      ].join('\n');
      return {
        files: [
          { path: 'data.yaml', text: yaml },
          {
            path: 'train.txt',
            text: list.map(({ name }) => `images/train/${name}\n`).join(''),
          },
          ...files,
        ],
        image: under('images/train'),
        skipped,
      };
    }
    case 'labelme':
      return {
        files: list.map(({ media, name, annotations }) => ({
          path: `default/${stem(name)}.xml`,
          text: [
            '<annotation>',
            `  <filename>${escape(name)}</filename>`,
            '  <folder></folder>',
            `  <imagesize><nrows>${media.height}</nrows><ncols>${media.width}</ncols></imagesize>`,
            ...annotations.flatMap((a, k) => {
              const g = a.geometry;
              let points: [number, number][], type: string | null;
              if (g.type === 'polygon' || g.type === 'polyline') {
                points = g.points;
                type = null;
              } else {
                const r = box(a);
                if (!r) return [];
                points = [
                  [r.x, r.y],
                  [r.x + r.width, r.y],
                  [r.x + r.width, r.y + r.height],
                  [r.x, r.y + r.height],
                ];
                type = 'bounding_box';
              }
              return [
                '  <object>',
                `    <name>${escape(a.label)}</name>`,
                '    <deleted>0</deleted>',
                '    <verified>0</verified>',
                '    <occluded>no</occluded>',
                `    <id>${k}</id>`,
                ...(type ? [`    <type>${type}</type>`] : []),
                '    <polygon>',
                ...points.map(([x, y]) => `      <pt><x>${n(x)}</x><y>${n(y)}</y></pt>`),
                '    </polygon>',
                '  </object>',
              ];
            }),
            '</annotation>',
            '',
          ].join('\n'),
        })),
        image: under('default'),
        skipped,
      };
    case 'kitti':
      return {
        files: list.map(({ name, annotations }) => ({
          path: `label_2/${stem(name)}.txt`,
          text: annotations
            .flatMap((a) => {
              const r = box(a);
              if (!r) return [];
              const type = a.label.trim().replace(/\s+/g, '_') || 'object';
              return [
                `${type} 0.00 0 0.00 ${n(r.x)} ${n(r.y)} ${n(r.x + r.width)} ${n(r.y + r.height)} 0.00 0.00 0.00 0.00 0.00 0.00 0.00\n`,
              ];
            })
            .join(''),
        })),
        image: under('image_2'),
        skipped,
      };
    case 'smartreview-json': {
      const media = new Map(dataset.media.map((m) => [m.id, m]));
      const out: Dataset = {
        ...dataset,
        frames: dataset.frames.map((f) => ({
          ...f,
          image: `images/${safePath(media.get(f.media_id)!.name)}`,
        })),
      };
      return {
        files: [{ path: 'dataset.json', text: JSON.stringify(out, null, 2) }],
        image: under('images'),
        skipped: 0,
      };
    }
  }
}
