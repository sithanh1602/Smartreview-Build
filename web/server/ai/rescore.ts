import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectRoot, venvPython, webRoot } from '../config.ts';
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
});
// The folder the import's score models are read from: one .pt file per model.
export const rescoreModelsRoot = () =>
  path.resolve(webRoot, process.env.SMARTREVIEW_RESCORE_MODELS_DIR || '../model/Model_rescore');

// Models the import can score with. Measured: BDD100K, the scorer of score_boxes.py at 1280 px on
// CPU (THAY-DOI-RISK-ENGINE.md 5). Estimated: the YOLO11s time scaled by Ultralytics' COCO CPU
// times (n 56, s 90, m 183 ms). Only YOLO11s has the policy thresholds (0.02, 0.4) measured for
// it; the others reuse them until ai-service/risk/ measures their own. A `missing` entry overrides
// the detection floor its own hints are cut at (default 0.4), and `imgsz` the pixels its weights
// were trained at (default 1280); both travel to the worker and the used floor is kept in
// dataset.metadata.rescore_missing, so the frame rule judges hints on the scorer's own scale.
// `blind` lists labels measured at zero recall: the worker leaves them unscored like unknown
// labels. `rescore_floor` travels only once the model is measured on the rescore scale itself,
// into dataset.metadata.rescore_floor for the box rule; until then the policy number rules.
// A model is offered only when its file is in rescoreModelsRoot(); this list describes the
// files it knows by name. Any other .pt there is offered too, with the shared defaults.
export const DEFAULT_SCORE_MODEL = 'yolo11s';
export const SCORE_MODELS = [
  {
    id: 'yolo11n',
    file: 'yolo11n.pt',
    name: 'YOLO11n',
    speed: 'Nhanh nhất · ~0,2–0,3 giây/ảnh (ước tính)',
    quality: 'AUROC 0,90 tách box hỏng · COCO mAP 39,5',
    note: 'Kém nhất với vật nhỏ. Hợp để chấm thử nhanh dataset lớn.',
  },
  {
    id: 'yolo11s',
    file: 'yolo11s.pt',
    name: 'YOLO11s',
    speed: 'Cân bằng · 0,3–0,5 giây/ảnh (đã đo)',
    quality: 'AUROC 0,92 tách box hỏng · tìm lại 39% box bị sót · COCO mAP 47,0',
    note: 'Mặc định. Ngưỡng của policy được đo với model này.',
  },
  {
    id: 'yolo11m',
    file: 'yolo11m.pt',
    name: 'YOLO11m',
    speed: 'Chậm nhất · ~0,6–1,0 giây/ảnh (ước tính)',
    quality: 'AUROC 0,92 tách box hỏng · COCO mAP 51,5',
    note: 'Chậm gấp đôi YOLO11s, rescore không tốt hơn; có thể tìm vật bị sót tốt hơn (chưa đo).',
  },
  {
    // Stock COCO weights from the yolo26s fine-tune run (results/weights/yolo26n.pt). Not measured
    // on the rescore scale: it reuses the shared thresholds.
    id: 'yolo26n',
    file: 'yolo26n.pt',
    name: 'YOLO26n (COCO gốc)',
    speed: 'Nhanh · chưa đo',
    quality: 'Model COCO gốc, chưa fine-tune; chưa đo trên BDD100K',
    note: 'Dùng ngưỡng chung (rescore 0,02, vật bị sót 0,4). Không chấm được biển báo.',
  },
  {
    // The pretrained checkpoint the fine-tune started from (results/yolo26s.pt, sha 646f8b…),
    // renamed so it does not take the fine-tune's file name.
    id: 'yolo26s-coco',
    file: 'yolo26s-coco.pt',
    name: 'YOLO26s (COCO gốc)',
    speed: 'Cân bằng · chưa đo',
    quality: 'Điểm xuất phát của bản fine-tune; chưa đo trên BDD100K',
    note: 'Dùng ngưỡng chung (rescore 0,02, vật bị sót 0,4). Không chấm được biển báo.',
  },
  {
    // Fine-tuned on BDD100K at 960 px (result_yolo26s, run bdd100k-yolo26s-960-seed42). `missing`
    // is the operating point of its own calibration (threshold_lock.json: 0.3055 at precision
    // 0.80). Knows traffic light/sign, which COCO models do not. `rescore_floor` was measured
    // with the broken-box protocol (400 val images, 15% broken, seed 0): AUROC 0.9505, and at
    // 0.02 it catches 93% of broken boxes while flagging 11% of correct ones (YOLO11s: 91%/18%;
    // boxes >= 16 px: 94%/6%). Recording 0.02 pins the measured value into each dataset it
    // scores, so a later policy move cannot silently re-judge those datasets.
    id: 'yolo26s',
    file: 'yolo26s.pt',
    name: 'YOLO26s fine-tune',
    speed: 'Cân bằng · ~0,3–0,5 giây/ảnh (ước tính)',
    quality: 'Fine-tune BDD100K · precision 0,81 / recall 0,67 holdout · chấm được biển báo, đèn',
    note: 'Weights result_yolo26s của bạn. Vật bị sót cắt ở 0,31 (điểm vận hành của nó); thang rescore đã đo riêng (AUROC 0,95), giữ 0,02.',
    missing: 0.3055,
    imgsz: 960,
    rescore_floor: 0.02,
    // REPORT.md holdout: 0/15 trains found. Left unscored instead of flagging on blindness.
    blind: ['train'],
  },
] as const;
export type ScoreModelId = (typeof SCORE_MODELS)[number]['id'];

type ScoreModel = {
  id: string;
  file: string;
  name: string;
  speed: string;
  quality: string;
  note: string;
  missing?: number;
  imgsz?: number;
  rescore_floor?: number;
  blind?: readonly string[];
};
// The models in rescoreModelsRoot(), by file name; the id is the name without ".pt".
export async function listScoreModels(root = rescoreModelsRoot()) {
  let names: string[];
  try {
    names = await fs.readdir(root);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const models: (ScoreModel & { default: boolean })[] = [];
  for (const file of names.sort()) {
    if (file.startsWith('.') || !file.endsWith('.pt')) continue;
    if (!(await fs.stat(path.join(root, file)).catch(() => null))?.isFile()) continue;
    const id = file.slice(0, -3);
    const known: ScoreModel | undefined = SCORE_MODELS.find((m) => m.file === file);
    models.push({
      ...(known ?? {
        id,
        file,
        name: id,
        speed: 'Chưa đo',
        quality: 'Chưa đo',
        note: 'Không có trong danh mục đã đo: dùng ngưỡng chung (rescore 0,02, vật bị sót 0,4) và ảnh 1280 px.',
      }),
      default: id === DEFAULT_SCORE_MODEL,
    });
  }
  return models;
}
// A model of the folder by id, and its file; unknown ids fail before any image is read.
export async function findScoreModel(modelId: string, root = rescoreModelsRoot()) {
  const entry = (await listScoreModels(root)).find((m) => m.id === modelId);
  if (!entry)
    throw new ReviewError(
      400,
      `Không có model chấm điểm “${modelId}” trong thư mục model/Model_rescore.`,
    );
  return { entry, file: path.join(root, entry.file) };
}
// The scorer's numbers for one model: its hint cut, training pixels, blind labels, and the
// measured rescore floor when it has one. Pinned here so a dataset keeps the values its model
// was measured at even if the policy defaults move later.
export const scoreSettings = (entry: ScoreModel) => ({
  entry,
  // The scorer's own cut for this model's hints, and the pixels its weights were trained at.
  missing: entry.missing ?? 0.4,
  imgsz: entry.imgsz ?? 1280,
  // Labels the model is blind to (measured zero recall): left unscored like unknown labels,
  // so their boxes skip instead of flagging on noise. The rescore floor travels only when
  // this model was measured on the rescore scale; the rest reuse the policy number.
  blind: [...(entry.blind ?? [])],
  rescoreFloor: entry.rescore_floor,
});
export async function rescoreDataset(
  data: Dataset,
  // Frame id -> image file on disk.
  images: Map<string, string>,
  directory: string,
  onProgress: (completed: number, total: number) => void,
  modelId: string = DEFAULT_SCORE_MODEL,
) {
  const { python } = rescoreSetup();
  const found = await findScoreModel(modelId);
  const { missing, imgsz, blind, rescoreFloor } = scoreSettings(found.entry);
  const model = found.file;
  const hasPython = await fs.access(python).then(
    () => true,
    () => false,
  );
  if (!hasPython)
    throw new ReviewError(
      503,
      `Chưa có Python cho model chấm điểm (${python}). Chạy ./setup.sh để cài .venv, hoặc đặt SMARTREVIEW_AI_PYTHON theo docs/ai-check.md. Chọn “Không chấm điểm” để import không chấm điểm.`,
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
    const child = spawn(
      python,
      [
        worker,
        input,
        model,
        output,
        projectRoot,
        String(imgsz),
        String(missing),
        JSON.stringify(blind),
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, OMP_NUM_THREADS: '2', MKL_NUM_THREADS: '2' },
      },
    );
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
    model?: { name?: string; missing_threshold?: number };
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
  // Thresholds belong to a model, so the dataset keeps which one scored it and the cut its
  // hints were made at; the frame rule judges hints on that cut, not the policy default.
  const usedMissing =
    typeof result.model?.missing_threshold === 'number' ? result.model.missing_threshold : missing;
  data.dataset.metadata = {
    ...data.dataset.metadata,
    rescore_model: modelId,
    rescore_missing: usedMissing,
    ...(rescoreFloor !== undefined && { rescore_floor: rescoreFloor }),
  };
  return {
    scored: Object.keys(result.rescore).length,
    missing: Object.values(hints).flat().length,
  };
}
