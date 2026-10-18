import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { projectRoot } from '../config.ts';
import type { Risk } from './scans.ts';

export interface PointPillarsPrediction {
  frame_id: string;
  frame_index: number;
  label: string;
  confidence: number;
  cuboid: {
    center: [number, number, number];
    size: [number, number, number];
    heading: number;
  };
}

export interface PointPillarsResult {
  predictions: PointPillarsPrediction[];
  labels: string[];
  model: string;
  available: boolean;
}

const runnerScript = path.join(projectRoot, 'ai-service/pointpillars_runner.py');

export async function getPointPillarsPaths() {
  const python =
    process.env.SMARTREVIEW_AI_PYTHON || path.join(projectRoot, '.venv/bin/python');
  const candidateModels = [
    process.env.SMARTREVIEW_3D_MODEL,
    path.join(projectRoot, 'ai-service/models/pointpillars_waymo.pth'),
    path.join(projectRoot, 'ai-service/models/pointpillars_kitti.pth'),
    path.join(projectRoot, 'ai-service/models/pointpillars_waymo_latest.pth'),
    path.join(projectRoot, '.venv/models/pointpillars_waymo.pth'),
    path.join(projectRoot, '.venv/models/pointpillars_kitti.pth'),
    path.join(projectRoot, '.venv/models/epoch_160.pth'),
    path.join(projectRoot, 'ai-service/pointpillars_model/pretrained/epoch_160.pth'),
  ].filter(Boolean) as string[];

  let model = candidateModels[0];
  for (const m of candidateModels) {
    try {
      await fs.access(m);
      model = m;
      break;
    } catch {}
  }

  try {
    await fs.access(python);
    await fs.access(model);
    await fs.access(runnerScript);
    return { python, model, available: true };
  } catch {
    return { python, model, available: false };
  }
}

import { queueService } from '../queue/index.ts';

/**
 * Runs PointPillars inference on a list of point cloud files.
 */
export async function runPointPillarsOnPointClouds(
  files: { frame_index: number; path: string }[],
  onProgress?: (done: number, total: number) => void,
): Promise<PointPillarsResult> {
  const { python, model, available } = await getPointPillarsPaths();
  if (!available || !files.length) {
    return { predictions: [], labels: [], model: 'PointPillars', available: false };
  }

  return queueService.runAiTask(
    `PointPillars (${files.length} frames)`,
    async () => {
      const runId = randomUUID();
      const cacheDir = path.dirname(files[0].path);
      const manifestPath = path.join(cacheDir, `pp_manifest_${runId}.json`);
      const outputPath = path.join(cacheDir, `pp_output_${runId}.json`);

      const manifestFrames = files.map((f) => ({
        id: `frame_${f.frame_index}`,
        index: f.frame_index,
        path: f.path,
      }));

      await fs.writeFile(manifestPath, JSON.stringify({ frames: manifestFrames }));

      try {
        await new Promise<void>((resolve, reject) => {
          const child = spawn(python, [runnerScript, manifestPath, model, outputPath], {
            stdio: ['ignore', 'pipe', 'pipe'],
          });

          let err = '';
          child.stderr.on('data', (d) => {
            const str = d.toString();
            err += str;
            const m = str.match(/\[PROGRESS\]\s+(\d+)\/(\d+)/);
            if (m && onProgress) {
              onProgress(Number(m[1]), Number(m[2]));
            }
          });
          child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`PointPillars runner failed (code ${code}): ${err}`));
          });
          child.on('error', reject);
        });

        const raw = await fs.readFile(outputPath, 'utf8');
        const parsed = JSON.parse(raw);
        return {
          predictions: parsed.predictions ?? [],
          labels: parsed.labels ?? [],
          model: parsed.model ?? 'PointPillars',
          available: true,
        };
      } finally {
        await Promise.all([
          fs.unlink(manifestPath).catch(() => {}),
          fs.unlink(outputPath).catch(() => {}),
        ]);
      }
    },
    { model: 'PointPillars', frameCount: files.length },
  );
}

/**
 * Matches PointPillars predictions against annotated 3D cuboids to find missing objects or classification errors.
 */
/**
 * Evaluates PointPillars predictions against annotated 3D cuboids to detect:
 * 1. Missing objects (vật thể PointPillars phát hiện nhưng annotator chưa vẽ box).
 * 2. Label mismatches (vật thể đã có box nhưng sai phân loại).
 */
export function evaluatePointPillars3DRisks(
  predictions: PointPillarsPrediction[],
  sceneFrames: { timestamp: number; boxes: any[] }[],
): Risk[] {
  const risks: Risk[] = [];

  for (const frame of sceneFrames) {
    const frameNumber = frame.timestamp;
    const framePreds = predictions.filter((p) => p.frame_index === frameNumber);
    const frameBoxes = frame.boxes || [];

    for (const pred of framePreds) {
      const [px, py, pz] = pred.cuboid.center;
      const [dx, dy, dz] = pred.cuboid.size;
      const range = Math.hypot(px, py);

      // 1. Phễu lọc hình học hợp lệ (Geometric Quality Filter)
      // Loại bỏ các phát hiện quá gần thân xe (nhiễu phản xạ) hoặc quá xa (> 65m)
      if (range < 1.2 || range > 65.0) continue;

      // Loại bỏ các hộp bay trên trời hoặc chìm sâu dưới lòng đất
      if (pz < -2.5 || pz > 4.5) continue;

      // Kiểm tra kích thước hợp lý theo class để loại bỏ false positives
      const pLabel = String(pred.label).toLowerCase();
      const isVeh = pLabel.includes('car') || pLabel.includes('veh') || pLabel.includes('truck') || pLabel.includes('bus');
      const isPed = pLabel.includes('ped') || pLabel.includes('person');
      const isCyc = pLabel.includes('cyc') || pLabel.includes('bike');

      if (isVeh) {
        if (dx < 1.5 || dx > 16.0 || dy < 1.1 || dy > 3.6 || dz < 0.9 || dz > 4.8) continue;
      } else if (isPed) {
        if (dx > 2.0 || dy > 2.0 || dz < 0.7 || dz > 2.5) continue;
      } else if (isCyc) {
        if (dx > 3.2 || dy > 2.0 || dz < 0.7 || dz > 2.5) continue;
      }

      // 2. Ngưỡng tự tin thích ứng theo class và cự ly (Adaptive Confidence)
      // Người đi bộ & xe đạp phản xạ ít điểm LiDAR (10-30 điểm) -> ngưỡng tự tin tự nhiên từ 0.20 - 0.40
      // Xe hơi có khối phản xạ dày đặc -> ngưỡng tự tin từ 0.32 - 0.55
      let minConf: number;
      if (isPed || isCyc) {
        minConf = range <= 25 ? 0.20 : range <= 45 ? 0.24 : 0.30;
      } else {
        minConf = range <= 25 ? 0.32 : range <= 45 ? 0.42 : 0.52;
      }
      if (pred.confidence < minConf) continue;

      // 3. Khớp hộp có phân biệt class (Class-Aware Matching)
      let matchedSameClassBox: any = null;
      let bestSameDist = Infinity;

      let matchedDiffClassBox: any = null;
      let bestDiffDist = Infinity;

      for (const box of frameBoxes) {
        if (!box.center || !box.size) continue;
        const [bx, by, bz] = box.center;
        const [bsx, bsy, bsz] = box.size;
        const hDist = Math.hypot(bx - px, by - py);
        const zDist = Math.abs(bz - pz);
        const dist = Math.hypot(hDist, zDist);

        const bType = String(box.type || box.label || '').toUpperCase();
        const boxIsVeh = bType.includes('VEH') || bType.includes('CAR') || bType.includes('TRUCK') || bType.includes('BUS');
        const boxIsPed = bType.includes('PED') || bType.includes('PERSON');
        const boxIsCyc = bType.includes('CYC') || bType.includes('BIKE');

        const isSame = (isVeh && boxIsVeh) || (isPed && boxIsPed) || (isCyc && boxIsCyc);

        if (isSame) {
          // Bán kính khớp hợp lý theo từng class: Người đi bộ nhỏ hơn xe hơi
          const maxMatchRadius = isPed ? 1.6 : isCyc ? 2.0 : Math.max(2.2, Math.min(4.0, (Math.max(dx, dy) + Math.max(bsx, bsy)) * 0.5));
          if (hDist <= maxMatchRadius && zDist <= 2.0 && dist < bestSameDist) {
            bestSameDist = dist;
            matchedSameClassBox = box;
          }
        } else {
          // Khác class nhưng ở cùng vị trí (< 1.6m): Khả năng annotator vẽ nhầm nhãn (ví dụ nhầm pedestrian thành sign/vehicle)
          if (hDist <= 1.6 && zDist <= 1.8 && dist < bestDiffDist) {
            bestDiffDist = dist;
            matchedDiffClassBox = box;
          }
        }
      }

      // 4. Nếu đã có box cùng class -> Đã được annotator vẽ chuẩn, không bỏ sót
      if (matchedSameClassBox) {
        continue;
      }

      // 5. Nếu có box ở đây nhưng SAI NHÃN (Label Mismatch)
      if (matchedDiffClassBox && pred.confidence >= (isPed ? 0.28 : 0.40)) {
        const rawId = matchedDiffClassBox.id?.includes(':') ? matchedDiffClassBox.id.split(':')[1] : matchedDiffClassBox.id;
        const displayLabel = matchedDiffClassBox.label || matchedDiffClassBox.type || 'Không xác định';
        risks.push({
          id: `ai_3d:${frameNumber}:mismatch:${rawId || `${Math.round(px * 10)}_${Math.round(py * 10)}`}`,
          frame: frameNumber,
          object_id: rawId,
          label: displayLabel,
          severity: 'warning',
          score: Math.min(95, Math.round(pred.confidence * 100)),
          confidence: pred.confidence,
          reasons: [
            `Nghi vấn sai nhãn: Đối tượng #${rawId || ''} đang gắn nhãn "${displayLabel}" nhưng PointPillars phát hiện "${pred.label}" (độ tin cậy ${Math.round(pred.confidence * 100)}%, cự ly ${range.toFixed(1)}m)`,
          ],
          check_ids: ['ai_3d.label_mismatch'],
          bbox: null,
          source: 'ai',
          geometry_type: 'cuboid',
          cuboid: {
            center: matchedDiffClassBox.center,
            size: matchedDiffClassBox.size,
            heading: matchedDiffClassBox.heading,
          },
          evidence: [
            {
              rule: 'ai_3d.label_mismatch',
              model: 'PointPillars',
              anno_label: displayLabel,
              ai_label: pred.label,
              confidence: pred.confidence,
              distance_m: Math.round(bestDiffDist * 10) / 10,
            },
          ],
        });
        continue;
      }

      // 6. Phát hiện BỎ SÓT VẬT THỂ (Missing Object): AI phát hiện tin cậy nhưng hoàn toàn chưa có box
      const confPercent = Math.round(pred.confidence * 100);
      const isHighConf = isPed ? pred.confidence >= 0.28 : pred.confidence >= 0.50;
      risks.push({
        id: `ai_3d:${frameNumber}:missing:${Math.round(px * 10)}_${Math.round(py * 10)}`,
        frame: frameNumber,
        object_id: null,
        label: pred.label,
        severity: isHighConf ? 'high' : 'medium',
        score: Math.min(96, Math.max(50, Math.round(pred.confidence * 100))),
        confidence: pred.confidence,
        reasons: [
          `PointPillars phát hiện ${pred.label} (độ tin cậy ${confPercent}%, cự ly ${range.toFixed(1)}m) chưa được vẽ box`,
        ],
        check_ids: ['ai_3d.missing_object'],
        bbox: null,
        source: 'ai',
        geometry_type: 'cuboid',
        cuboid: {
          center: pred.cuboid.center,
          size: pred.cuboid.size,
          heading: pred.cuboid.heading,
        },
        evidence: [
          {
            rule: 'ai_3d.missing_object',
            model: 'PointPillars',
            label: pred.label,
            confidence: pred.confidence,
            range_m: Math.round(range * 10) / 10,
          },
        ],
      });
    }
  }

  return risks;
}

