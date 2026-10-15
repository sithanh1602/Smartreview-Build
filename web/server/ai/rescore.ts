import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectRoot } from '../config.ts';
import { ReviewError } from '../../shared/review.ts';
import { applyMissingHints } from '../../core/importers/signals.ts';
import type { MissingHint } from '../../core/importers/signals.ts';
import type { Dataset } from '../../core/schema/types.ts';

// The import step that scores a dataset nobody scored: every box a person drew gets a rescore
// (attributes.rescore) and every object the model found that no box covers becomes a missing
// hint (dataset.metadata.missing_hints). The scorer is ai-service/score_boxes.py.
const worker = fileURLToPath(new URL('./rescore.py', import.meta.url));
export const rescoreSetup = () => ({
  python: process.env.SMARTREVIEW_AI_PYTHON || path.join(projectRoot, '.venv/bin/python'),
  // The rule thresholds were measured with YOLO11s; another model needs them measured again.
  model: process.env.SMARTREVIEW_SCORE_MODEL || path.join(projectRoot, 'ai-service/yolo11s.pt'),
});
export async function rescoreAvailable() {
  const { python, model } = rescoreSetup();
  try {
    await fs.access(python);
    await fs.access(model);
    return true;
  } catch {
    return false;
  }
}
export async function rescoreDataset(
  data: Dataset,
  // Frame id -> image file on disk.
  images: Map<string, string>,
  directory: string,
  onProgress: (completed: number, total: number) => void,
) {
  const { python, model } = rescoreSetup();
  if (!(await rescoreAvailable()))
    throw new ReviewError(
      503,
      'Chưa có Python hoặc model chấm điểm (SMARTREVIEW_SCORE_MODEL, mặc định ai-service/yolo11s.pt). Bỏ chọn “Chấm điểm box bằng model” hoặc cấu hình theo docs/ai-check.md.',
    );
  const frames = data.frames
    .filter((f) => images.has(f.id))
    .map((f) => ({
      id: f.id,
      path: images.get(f.id)!,
      boxes: data.annotations.flatMap((a) =>
        a.frame_id === f.id && a.geometry.type === 'bbox'
          ? [
              {
                id: a.id,
                label: a.label,
                box: [
                  a.geometry.x,
                  a.geometry.y,
                  a.geometry.x + a.geometry.width,
                  a.geometry.y + a.geometry.height,
                ],
              },
            ]
          : [],
      ),
    }));
  const input = path.join(directory, 'rescore-input.json'),
    output = path.join(directory, 'rescore-output.json');
  await fs.writeFile(
    input,
    JSON.stringify({ frames, labels: [...new Set(data.annotations.map((a) => a.label))] }),
  );
  onProgress(0, frames.length);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(python, [worker, input, model, output, projectRoot], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, OMP_NUM_THREADS: '2', MKL_NUM_THREADS: '2' },
    });
    let pending = '',
      diagnostic = '';
    const timer = setTimeout(
      () => {
        child.kill('SIGKILL');
        reject(new ReviewError(504, 'Chấm điểm quá 20 phút. Thử dataset nhỏ hơn.'));
      },
      20 * 60 * 1000,
    );
    child.stdout.on('data', (chunk) => {
      pending = (pending + chunk.toString()).slice(-10000);
      const lines = pending.split('\n');
      pending = lines.pop()!;
      for (const line of lines) {
        try {
          const { completed } = JSON.parse(line);
          if (Number.isInteger(completed)) onProgress(completed, frames.length);
        } catch {}
      }
    });
    child.stderr.on('data', (chunk) => {
      diagnostic = (diagnostic + chunk.toString()).slice(-2000);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      console.error('Rescore worker failed:', diagnostic);
      reject(new ReviewError(500, 'Không chạy được model chấm điểm. Xem log của server.'));
    });
  });
  const result: {
    rescore: Record<string, number>;
    missing: Record<string, { label: string; confidence: number; box: number[] }[]>;
  } = JSON.parse(await fs.readFile(output, 'utf8'));
  await fs.rm(input, { force: true });
  await fs.rm(output, { force: true });
  for (const a of data.annotations)
    if (a.id in result.rescore) a.attributes = { ...a.attributes, rescore: result.rescore[a.id] };
  const hints: Record<string, MissingHint[]> = Object.fromEntries(
    Object.entries(result.missing).map(([frame, found]) => [
      frame,
      found.map(({ label, confidence, box: [x1, y1, x2, y2] }) => ({
        label,
        confidence,
        geometry: { type: 'bbox' as const, x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
      })),
    ]),
  );
  // A file scored before keeps no hints of its own: these replace them.
  if (data.dataset.metadata) delete data.dataset.metadata.missing_hints;
  applyMissingHints(data, hints);
  return {
    scored: Object.keys(result.rescore).length,
    missing: Object.values(hints).flat().length,
  };
}
