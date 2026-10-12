import { applySignals } from './signals.ts';
import { emptyDataset, sizeOf } from './shared.ts';
import type { ImportOptions, Loose } from './signals.ts';
import type { Point } from '../schema/types.ts';

const object = (value: unknown): value is Loose =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Datumaro 1.0: one JSON with `categories` and `items`; each item is an image with its
// annotations. Boxes, polygons and polylines are read; masks, points and labels are skipped.
export function importDatumaro(text: string, options: ImportOptions = {}) {
  const input: unknown = JSON.parse(text);
  if (!object(input) || !Array.isArray(input.items) || !object(input.categories))
    throw new Error('Datumaro cần object chứa categories và items.');
  const labels: string[] = (input.categories.label?.labels ?? []).map((l: Loose) =>
    String(l?.name),
  );
  const data = emptyDataset(
    options,
    { id: 'datumaro', name: 'Datumaro annotations' },
    'Datumaro 1.0',
  );
  for (const [i, item] of input.items.entries()) {
    if (!object(item) || item.id == null) throw new Error(`Datumaro item ${i}: thiếu id.`);
    const picture = item.image ?? item.media ?? {};
    const path = String(picture.path || item.id);
    const stated = Array.isArray(picture.size) ? picture.size : null;
    const size =
      stated && stated[0] > 0 && stated[1] > 0
        ? { width: Number(stated[1]), height: Number(stated[0]) }
        : sizeOf(options, path, 'Datumaro');
    const mediaId = `image-${i}`,
      frameId = `${mediaId}:0`;
    data.media.push({ id: mediaId, name: path, type: 'image', ...size });
    data.frames.push({ id: frameId, media_id: mediaId, index: 0, image: `images/${path}` });
    for (const [n, a] of (Array.isArray(item.annotations) ? item.annotations : []).entries()) {
      if (!object(a) || !['bbox', 'polygon', 'polyline'].includes(a.type)) continue;
      const label = labels[a.label_id] ?? (a.label_id == null ? 'unknown' : String(a.label_id));
      const flat: number[] = a.type === 'bbox' ? a.bbox : a.points;
      if (!Array.isArray(flat) || flat.some((v) => typeof v !== 'number'))
        throw new Error(`Datumaro item ${item.id}: annotation ${n} có toạ độ không hợp lệ.`);
      const attributes = object(a.attributes) ? a.attributes : {};
      data.annotations.push(
        applySignals({
          id: `${mediaId}-${a.type === 'bbox' ? 'box' : a.type}-${n}`,
          frame_id: frameId,
          label,
          geometry:
            a.type === 'bbox'
              ? { type: 'bbox', x: flat[0], y: flat[1], width: flat[2], height: flat[3] }
              : {
                  type: a.type,
                  points: Array.from({ length: flat.length >> 1 }, (_, k) => [
                    flat[2 * k],
                    flat[2 * k + 1],
                  ]) as Point[],
                },
          source: {
            kind:
              attributes.source === 'manual'
                ? 'human'
                : attributes.source === 'auto'
                  ? 'model'
                  : 'unknown',
            name: 'Datumaro',
          },
          attributes,
        }),
      );
    }
  }
  if (!data.frames.length) throw new Error('Datumaro: items không được rỗng.');
  return data;
}
