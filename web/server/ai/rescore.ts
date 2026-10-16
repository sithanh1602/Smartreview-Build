import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectRoot, venvPython } from '../config.ts';
import { ReviewError } from '../../shared/review.ts';
import { applyMissingHints } from '../../core/importers/signals.ts';
import type { MissingHint } from '../../core/importers/signals.ts';
import type { Dataset } from '../../core/schema/types.ts';

// The import step that scores a dataset nobody scored: every box a person drew gets a rescore
// (attributes.rescore) and every object the model found that no box covers becomes a missing
// hint (dataset.metadata.missing_hints). The scorer is ai-service/score_boxes.py.
const worker = fileURLToPath(new URL('./rescore.py', import.meta.url));
export const rescoreSetup = () => ({
  python: process.env.SMARTREVIEW_AI_PYTHON || venvPython,
  // The rule thresholds were measured with YOLO11s; another model needs them measured again.
  model: process.env.SMARTREVIEW_SCORE_MODEL || path.join(projectRoot, 'ai-service/yolo11s.pt'),
});

// Models the import can score with. Measured: BDD100K, the scorer of score_boxes.py at 1280 px on
// CPU (THAY-DOI-RISK-ENGINE.md 5). Estimated: the YOLO11s time scaled by Ultralytics' COCO CPU
// times (n 56, s 90, m 183 ms). Only YOLO11s has the policy thresholds (0.02, 0.4) measured for
// it; the others reuse them until ai-service/risk/ measures their own. `download`: the size of the
// Ultralytics release asset fetched into ai-service/ the first time a machine without the file
// picks it, so a fresh checkout scores with any of them.
export const DEFAULT_SCORE_MODEL = 'yolo11s';
export const SCORE_MODELS = [
  {
    id: 'yolo11n',
    file: 'yolo11n.pt',
    download: '5,4 MB',
    name: 'YOLO11n',
    speed: 'Nhanh nhất · ~0,2–0,3 giây/ảnh (ước tính)',
    quality: 'AUROC 0,90 tách box hỏng · COCO mAP 39,5',
    note: 'Kém nhất với vật nhỏ. Hợp để chấm thử nhanh dataset lớn.',
  },
  {
    id: 'yolo11s',
    file: 'yolo11s.pt',
    download: '19 MB',
    name: 'YOLO11s',
    speed: 'Cân bằng · 0,3–0,5 giây/ảnh (đã đo)',
    quality: 'AUROC 0,92 tách box hỏng · tìm lại 39% box bị sót · COCO mAP 47,0',
    note: 'Mặc định. Ngưỡng của policy được đo với model này.',
  },
  {
    id: 'yolo11m',
    file: 'yolo11m.pt',
    download: '39 MB',
    name: 'YOLO11m',
    speed: 'Chậm nhất · ~0,6–1,0 giây/ảnh (ước tính)',
    quality: 'AUROC 0,92 tách box hỏng · COCO mAP 51,5',
    note: 'Chậm gấp đôi YOLO11s, rescore không tốt hơn; có thể tìm vật bị sót tốt hơn (chưa đo).',
  },
] as const;
export type ScoreModelId = (typeof SCORE_MODELS)[number]['id'];

// The file of a model: the configured default for YOLO11s, else the first of the model folders
// that has it.
async function scoreModelPath(id: string) {
  const entry = SCORE_MODELS.find((m) => m.id === id);
  if (!entry) return null;
  const configured = rescoreSetup().model;
  const candidates = [
    ...(id === DEFAULT_SCORE_MODEL ? [configured] : []),
    ...[
      path.dirname(configured),
      path.join(projectRoot, 'ai-service'),
      path.join(projectRoot, 'ai-service/risk'),
    ].map((dir) => path.join(dir, entry.file)),
  ];
  for (const file of candidates) {
    try {
      await fs.access(file);
      return file;
    } catch {}
  }
  return null;
}
// Where a model with no file on this machine is downloaded to: Ultralytics fetches a release
// asset into the path it is given.
const downloadPath = (file: string) => path.join(projectRoot, 'ai-service', file);
export async function listScoreModels() {
  return Promise.all(
    SCORE_MODELS.map(async (m) => {
      const installed = (await scoreModelPath(m.id)) !== null;
      return {
        ...m,
        default: m.id === DEFAULT_SCORE_MODEL,
        installed,
      };
    }),
  );
}
export async function rescoreDataset(
  data: Dataset,
  // Frame id -> image file on disk.
  images: Map<string, string>,
  directory: string,
  // `downloading` while the worker fetches a model this machine does not have yet.
  onProgress: (completed: number, total: number, downloading?: boolean) => void,
  modelId: string = DEFAULT_SCORE_MODEL,
) {
  const { python } = rescoreSetup();
  const entry = SCORE_MODELS.find((m) => m.id === modelId);
  if (!entry) throw new ReviewError(400, `Không có model chấm điểm “${modelId}”.`);
  const found = await scoreModelPath(modelId);
  // A model not on disk is downloaded by the worker the first time it is picked.
  const model = found ?? downloadPath(entry.file);
  const hasPython = await fs.access(python).then(
    () => true,
    () => false,
  );
  if (!hasPython)
    throw new ReviewError(
      503,
      `Chưa có Python cho model chấm điểm (${python}). Chạy ./setup.sh để cài .venv, hoặc đặt SMARTREVIEW_AI_PYTHON theo docs/ai-check.md. Bỏ chọn “Chấm điểm box bằng model” để import không chấm điểm.`,
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
  onProgress(0, frames.length, !found);
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
          if (Number.isInteger(completed)) onProgress(completed, frames.length, false);
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
      // Exit 3: the worker could not download the model (rescore.py).
      if (code === 3)
        return reject(
          new ReviewError(
            503,
            `Không tải được model ${entry.file} (${entry.download}). Kiểm tra kết nối mạng, hoặc tải tay từ github.com/ultralytics/assets/releases rồi đặt vào ai-service/.`,
          ),
        );
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
  // Thresholds belong to a model, so the dataset keeps which one scored it.
  data.dataset.metadata = { ...data.dataset.metadata, rescore_model: modelId };
  return {
    scored: Object.keys(result.rescore).length,
    missing: Object.values(hints).flat().length,
  };
}
