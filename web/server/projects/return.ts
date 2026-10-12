import {
  detectFormats,
  imageResolver,
  importDataset,
  namesImages,
} from '../../core/importers/index.ts';
import { normalizeDataset } from '../../core/schema/normalize.ts';
import { mergeLabels } from '../../core/risk/policy.ts';
import { ReviewError } from '../../shared/review.ts';
import type { SourceFile } from '../../core/importers/index.ts';
import type { Dataset } from '../../core/schema/types.ts';

// Reads the annotation files an annotator returned, in whatever format the importer knows,
// as a dataset over the images the project already has. Also gives the frame of the old
// dataset each new frame replaces (old id -> new id). The file must cover exactly the
// project's images: an unknown, repeated, missing or resized image is refused.
export function returnedDataset(
  old: Dataset,
  files: SourceFile[],
  { id, name }: { id: string; name: string },
) {
  const oldMedia = new Map(old.media.map((m) => [m.id, m]));
  // Stored image of each frame, as the first import named it.
  const stored = new Map(old.frames.map((f) => [f.image ?? '', f]));
  const findImage = imageResolver([...stored.keys()].map((image) => image.replace(/^media\//, '')));
  const oldFrame = (reference: string) => {
    const name = findImage(reference);
    return name === null ? undefined : stored.get('media/' + name);
  };
  const [found] = detectFormats(files);
  if (!found)
    throw new ReviewError(
      422,
      'Không nhận ra định dạng file. Xuất từ CVAT dạng "CVAT for images 1.1" rồi gửi lại.',
    );
  let data: Dataset;
  try {
    data = importDataset(found.format, found.files, {
      id,
      name,
      sizes: (image) => {
        const frame = oldFrame(image);
        return frame && oldMedia.get(frame.media_id);
      },
    });
  } catch (e) {
    throw new ReviewError(422, (e as Error).message.slice(0, 1000));
  }
  if (data.annotations.length > 100000)
    throw new ReviewError(422, 'MVP hỗ trợ tối đa 100000 annotations và 10000 frames.');
  // Old frame id -> new frame id, by image.
  const frames = new Map<string, string>();
  const mediaById = new Map(data.media.map((m) => [m.id, m]));
  for (const f of data.frames) {
    const reference = namesImages(found.format)
      ? (f.image ?? '').slice('images/'.length)
      : (f.image ?? '');
    const match = oldFrame(reference);
    if (!match || frames.has(match.id))
      throw new ReviewError(422, `File có ảnh không thuộc project hoặc bị lặp: ${reference}`);
    const before = oldMedia.get(match.media_id)!,
      now = mediaById.get(f.media_id)!;
    if (before.width !== now.width || before.height !== now.height)
      throw new ReviewError(422, `Kích thước ảnh ${reference} không khớp ảnh của project.`);
    frames.set(match.id, f.id);
    f.image = match.image;
  }
  if (frames.size !== old.frames.length)
    throw new ReviewError(
      422,
      `File thiếu ${old.frames.length - frames.size} ảnh của project. Xuất đủ mọi ảnh rồi gửi lại.`,
    );
  for (const a of data.annotations) {
    const g = a.geometry;
    if (g.type === 'bbox' && (g.width <= 0 || g.height <= 0))
      throw new ReviewError(422, `BBox ${a.id}: width và height phải > 0.`);
  }
  data.dataset.metadata = old.dataset.metadata;
  data = mergeLabels(normalizeDataset(data));
  return { data, frames };
}
