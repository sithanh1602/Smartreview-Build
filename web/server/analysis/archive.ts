import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  detectFormats,
  imageResolver,
  importDataset,
  namesImages,
} from '../../core/importers/index.ts';
import { IMAGE_EXTENSIONS, extension } from '../../core/importers/shared.ts';
import { mergeLabels } from '../../core/risk/policy.ts';
import { readZip } from '../../src/lib/zip.ts';
import type { ZipEntry } from '../../src/lib/zip.ts';
import type { FormatId, SourceFile } from '../../core/importers/index.ts';
import type { LayoutReport, Unit } from '../../core/analysis/layout.ts';
import type { Dataset } from '../../core/schema/types.ts';

// A dataset archive as CVAT (or SmartReview) exports it: annotation files and, usually, the
// images. The annotations are read in whatever format the importer recognises.
const ANNOTATION_EXTENSIONS = ['.xml', '.json', '.txt', '.csv', '.names', '.yaml', '.yml'];
const MAX_ANNOTATION_BYTES = 64 * 1024 * 1024;
const PIXEL_LIMIT = 25000000;

export interface DatasetArchive {
  format: FormatId;
  data: Dataset;
  // The archive entry holding the image of a frame; undefined when the archive has no such image.
  image(frameId: string): ZipEntry | undefined;
  images: number;
}

export async function readDatasetArchive(file: string): Promise<DatasetArchive> {
  const entries = await readZip(await fs.openAsBlob(file));
  const pictures = new Map<string, ZipEntry>(),
    files: SourceFile[] = [];
  let bytes = 0;
  for (const entry of entries) {
    const ext = extension(entry.name);
    if (IMAGE_EXTENSIONS.includes(ext)) pictures.set(entry.name, entry);
    else if (ANNOTATION_EXTENSIONS.includes(ext)) {
      if ((bytes += entry.size) > MAX_ANNOTATION_BYTES)
        throw new Error('Các tệp nhãn trong ZIP vượt 64 MB.');
      files.push({ name: entry.name, text: await (await entry.blob()).text() });
    }
  }
  const [found] = detectFormats(files);
  if (!found) throw new Error('Không nhận ra định dạng nhãn trong ZIP.');
  const findImage = imageResolver(pictures.keys());
  const read = (sizes?: Map<string, { width: number; height: number }>) =>
    importDataset(found.format, found.files, {
      ...(sizes && { sizes: (image) => sizes.get(findImage(image) ?? '') }),
    });
  let data: Dataset;
  try {
    data = read();
  } catch (error) {
    // Formats that do not state image sizes (YOLO, KITTI, MOT) need the images measured.
    if (!pictures.size) throw error;
    const sizes = new Map<string, { width: number; height: number }>();
    for (const [name, entry] of pictures) {
      try {
        const { width, height } = await sharp(
          Buffer.from(await (await entry.blob()).arrayBuffer()),
          { limitInputPixels: PIXEL_LIMIT },
        ).metadata();
        sizes.set(name, { width, height });
      } catch {
        // An unreadable image has no size; the importer names it if it needs one.
      }
    }
    data = read(sizes);
  }
  mergeLabels(data);
  const byFrame = new Map<string, ZipEntry>();
  for (const frame of data.frames) {
    if (!frame.image) continue;
    const name = findImage(
      namesImages(found.format) ? frame.image.replace(/^images\//, '') : frame.image,
    );
    if (name !== null) byFrame.set(frame.id, pictures.get(name)!);
  }
  return {
    format: found.format,
    data,
    image: (frameId) => byFrame.get(frameId),
    images: byFrame.size,
  };
}

const COLOURS = ['#ff3b30', '#34c759', '#0a84ff', '#ffd60a', '#bf5af2', '#ff9f0a'];
const fileName = (id: string) => id.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120);

// Cuts every unit of a layout out of its image, into DIRECTORY/<kind>/<unit>.jpg, enlarged by
// the unit's scale. With `outline` each member box is drawn on the crop, one colour per box.
// Returns the file written for each unit; a unit whose image the archive lacks is left out.
export async function cropUnits(
  archive: DatasetArchive,
  report: LayoutReport,
  directory: string,
  { outline = false, kinds }: { outline?: boolean; kinds?: Unit['kind'][] } = {},
) {
  const written = new Map<string, string>();
  const wanted = report.units.filter((u) => !kinds || kinds.includes(u.kind));
  const byFrame = new Map<string, Unit[]>();
  for (const unit of wanted)
    byFrame.set(unit.frame_id, [...(byFrame.get(unit.frame_id) ?? []), unit]);
  for (const [frameId, units] of byFrame) {
    const entry = archive.image(frameId);
    if (!entry) continue;
    // One read per image, however many units it holds.
    const source = Buffer.from(await (await entry.blob()).arrayBuffer());
    for (const unit of units) {
      const { crop, scale } = unit,
        width = Math.round(crop.width * scale),
        height = Math.round(crop.height * scale);
      let image = sharp(source, { limitInputPixels: PIXEL_LIMIT })
        .rotate()
        .extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
        .resize(width, height, { kernel: 'lanczos3' });
      if (outline) {
        const stroke = Math.max(1, Math.round(scale));
        const boxes = unit.members
          .map(
            (m, i) =>
              `<rect x="${m.x * scale}" y="${m.y * scale}" width="${m.width * scale}" height="${m.height * scale}" fill="none" stroke="${COLOURS[i % COLOURS.length]}" stroke-width="${stroke}"/>`,
          )
          .join('');
        image = image.composite([
          {
            input: Buffer.from(
              `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${boxes}</svg>`,
            ),
          },
        ]);
      }
      const target = path.join(directory, unit.kind, `${fileName(unit.id)}.jpg`);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await image.jpeg({ quality: 90 }).toFile(target);
      written.set(unit.id, target);
    }
  }
  return written;
}
