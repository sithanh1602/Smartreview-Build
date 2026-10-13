import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ReviewError } from '../../shared/review.ts';
import { CAMERA_TILE, cameraImage, orderCameras } from '../../shared/waymo.ts';
import type { Untrusted } from '../../shared/review.ts';

// Camera images of a 3D project. They are kept as the JPEG files they came as, in
// <directory>/cameras/<CAMERA>/<timestamp>.jpg; nothing is re-encoded. For the viewer every
// frame also gets one small "sheet" holding all its cameras side by side.
const CAMERA_NAME = /^[A-Z0-9][A-Z0-9_-]{0,39}$/;
const SHEET_BACKGROUND = '#0d1117';
// Frames whose sheets are being made at the same time.
const PARALLEL = 4;

// Moves loose camera images, named <camera>/<frame>.jpg, to where the exporter would have put
// them. The number in the name is a frame's timestamp, or else its position in the segment.
// Returns how many had a number that is neither.
export async function placeShots(shots: Map<string, string>, directory: string, scene: Untrusted) {
  const timestamps = new Set<number>(scene.frames.map((f: { timestamp: number }) => f.timestamp));
  let unmatched = 0;
  for (const [name, file] of shots) {
    const { camera, frame } = cameraImage(name)!,
      number = Number(frame);
    const timestamp = timestamps.has(number) ? number : scene.frames[number]?.timestamp;
    if (timestamp === undefined) {
      unmatched++;
      continue;
    }
    const target = path.join(directory, 'cameras', camera, `${timestamp}.jpg`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await fs.copyFile(file, target, fs.constants.COPYFILE_EXCL);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      throw new ReviewError(422, `Hai ảnh camera cùng chỉ một frame: ${name}`);
    }
  }
  if (shots.size && unmatched === shots.size)
    throw new ReviewError(
      422,
      'Không ảnh camera nào khớp frame của segment. Tên ảnh phải là timestamp hoặc số thứ tự frame.',
    );
  return unmatched;
}

// Reads <directory>/cameras, writes the scene's `cameras` (display order) and each frame's
// `cameras` (those with an image of it), and makes the sheets in <directory>/sheets. Images of
// no known frame are removed. Returns false when the project has no camera images.
export async function buildSheets(
  directory: string,
  scene: Untrusted,
  onProgress: (done: number, total: number) => void,
) {
  const root = path.join(directory, 'cameras');
  let folders: string[];
  try {
    folders = await fs.readdir(root);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    return false;
  }
  const timestamps = new Set<string>(
    scene.frames.map((f: { timestamp: number }) => String(f.timestamp)),
  );
  // Camera names with an image, by frame timestamp.
  const byFrame = new Map<string, Set<string>>();
  for (const camera of folders) {
    if (!CAMERA_NAME.test(camera)) throw new ReviewError(422, `Tên camera không hợp lệ: ${camera}`);
    for (const file of await fs.readdir(path.join(root, camera))) {
      const timestamp = file.match(/^(\d+)\.jpg$/)?.[1];
      if (!timestamp || !timestamps.has(timestamp)) {
        await fs.rm(path.join(root, camera, file));
        continue;
      }
      byFrame.set(timestamp, (byFrame.get(timestamp) ?? new Set()).add(camera));
    }
  }
  const cameras = orderCameras([...byFrame.values()].flatMap((names) => [...names]));
  if (!cameras.length) {
    await fs.rm(root, { recursive: true, force: true });
    return false;
  }
  scene.cameras = cameras;
  for (const frame of scene.frames) {
    const present = byFrame.get(String(frame.timestamp));
    if (present) frame.cameras = cameras.filter((camera) => present.has(camera));
  }
  await fs.mkdir(path.join(directory, 'sheets'), { recursive: true });
  const { width, height } = CAMERA_TILE;
  const pending = [...byFrame.keys()];
  let done = 0;
  const worker = async () => {
    for (let timestamp = pending.pop(); timestamp; timestamp = pending.pop()) {
      const present = byFrame.get(timestamp)!;
      const tiles = await Promise.all(
        cameras.map(async (camera, i) =>
          present.has(camera)
            ? {
                left: i * width,
                top: 0,
                input: await sharp(path.join(root, camera, `${timestamp}.jpg`))
                  .resize(width, height, { fit: 'contain', background: SHEET_BACKGROUND })
                  .toBuffer()
                  .catch(() => {
                    throw new ReviewError(
                      422,
                      `Ảnh camera hỏng hoặc không phải JPEG: ${camera}/${timestamp}.jpg`,
                    );
                  }),
              }
            : null,
        ),
      );
      await sharp({
        create: {
          width: cameras.length * width,
          height,
          channels: 3,
          background: SHEET_BACKGROUND,
        },
      })
        .composite(tiles.filter((tile) => tile !== null))
        .jpeg({ quality: 72 })
        .toFile(path.join(directory, 'sheets', `${timestamp}.jpg`));
      onProgress(++done, byFrame.size);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return true;
}
