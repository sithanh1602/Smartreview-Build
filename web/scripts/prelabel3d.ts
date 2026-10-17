import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import '../server/env.ts';
import { createCvatShapes, getCvatFrameImage, getCvatJob, getCvatLabels } from '../server/cvat/client.ts';
import { runPointPillarsOnPointClouds } from '../server/cvat/pointpillars.ts';

// AI "annotator" for testing: PointPillars detects objects in a CVAT 3D job and writes them in as
// cuboids. Open the job in CVAT, review/delete some, then press Scan QA to test the checker.
// Usage: npm run prelabel3d -- <job_id> [--conf 0.6] [--max 60] [--dry]
const { values, positionals } = parseArgs({
  options: { conf: { type: 'string' }, max: { type: 'string' }, dry: { type: 'boolean' } },
  allowPositionals: true,
});
const jobId = Number(positionals[0]);
if (!Number.isInteger(jobId) || jobId < 1)
  throw new Error('Usage: npm run prelabel3d -- <job_id> [--conf 0.6] [--max 60] [--dry]');
const minConf = Number(values.conf ?? 0.6);
const maxFrames = Number(values.max ?? 60);

const job = (await getCvatJob(jobId)) as any;
if (job.dimension !== '3d') throw new Error('Job không phải 3D.');
const labels = await getCvatLabels(jobId);
const pick = (...keys: string[]) =>
  labels.find((l) => keys.some((k) => String(l.name).toLowerCase().includes(k)));
const labelFor: Record<string, any> = {
  Car: pick('car', 'vehicle'),
  Pedestrian: pick('ped', 'person'),
  Cyclist: pick('cyc', 'bike'),
};
console.error(
  'Map nhãn:',
  Object.entries(labelFor).map(([k, v]) => `${k}→${v?.name ?? '(không có)'}`).join(', '),
);

const start = Number(job.start_frame),
  stop = Number(job.stop_frame);
const all = Array.from({ length: stop - start + 1 }, (_, i) => start + i);
const step = Math.max(1, Math.ceil(all.length / maxFrames));
const frames = all.filter((_, i) => i % step === 0).slice(0, maxFrames);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smartreview-prelabel3d-'));
try {
  const files: { frame_index: number; path: string }[] = [];
  for (const f of frames) {
    try {
      const p = path.join(root, `${f}.pcd`);
      await fs.writeFile(p, await getCvatFrameImage(jobId, f));
      files.push({ frame_index: f, path: p });
    } catch {
      console.error(`Bỏ qua frame ${f}: không tải được point cloud.`);
    }
  }
  console.error(`Chạy PointPillars trên ${files.length} frame (CPU có thể mất vài phút)…`);
  const result = await runPointPillarsOnPointClouds(files);
  if (!result.available) throw new Error('PointPillars chưa sẵn sàng (thiếu model/python).');
  const shapes = result.predictions
    .filter((p) => p.confidence >= minConf && labelFor[p.label])
    .map((p) => ({
      type: 'cuboid',
      frame: p.frame_index,
      label_id: labelFor[p.label].id,
      // CVAT cuboid: position(3) rotation(3) scale(3) + 7 reserved zeros
      points: [...p.cuboid.center, 0, 0, p.cuboid.heading, ...p.cuboid.size, 0, 0, 0, 0, 0, 0, 0],
      rotation: 0,
      occluded: false,
      outside: false,
      z_order: 0,
      group: 0,
      source: 'auto',
      attributes: [],
    }));
  console.error(`AI thấy ${result.predictions.length} vật thể, ghi ${shapes.length} cuboid (conf ≥ ${minConf}).`);
  if (values.dry) console.error('--dry: không ghi vào CVAT.');
  else if (shapes.length) await createCvatShapes(jobId, shapes);
  console.error('Xong. Mở lại job trong CVAT (F5) rồi bấm Scan QA.');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
