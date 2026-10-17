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
      if (pLabel.includes('car') || pLabel.includes('veh') || pLabel.includes('truck')) {
        if (dx < 1.8 || dx > 16.0 || dy < 1.1 || dy > 3.6 || dz < 1.0 || dz > 4.8) continue;
      } else if (pLabel.includes('ped') || pLabel.includes('person')) {
        if (dx > 1.8 || dy > 1.8 || dz < 0.7 || dz > 2.5) continue;
      } else if (pLabel.includes('cyc') || pLabel.includes('bike')) {
        if (dx > 3.2 || dy > 2.0 || dz < 0.7 || dz > 2.5) continue;
      }

      // 2. Ngưỡng tự tin thích ứng theo cự ly (Adaptive Confidence)
      // Càng xa cảm biến thì điểm phản xạ càng thưa -> cần độ tự tin cao hơn để tránh báo ảo
      const minConf = range <= 25 ? 0.48 : range <= 45 ? 0.55 : 0.65;
      if (pred.confidence < minConf) continue;

      // 3. Tìm box do annotator vẽ khớp với dự đoán của AI
      let bestDist = Infinity;
      let matchedBox: any = null;
      const predMaxDim = Math.max(dx, dy);

      for (const box of frameBoxes) {
        if (!box.center || !box.size) continue;
        const [bx, by, bz] = box.center;
        const [bsx, bsy, bsz] = box.size;
        const hDist = Math.hypot(bx - px, by - py);
        const zDist = Math.abs(bz - pz);
        const dist = Math.hypot(hDist, zDist);

        // Bán kính khớp thích ứng theo kích thước hộp của cả 2 bên
        const boxMaxDim = Math.max(bsx, bsy);
        const matchThreshold = Math.max(2.0, Math.min(4.5, (predMaxDim + boxMaxDim) * 0.55));

        if ((dist < matchThreshold || (hDist < 1.8 && zDist < 2.0)) && dist < bestDist) {
          bestDist = dist;
          matchedBox = box;
        }
      }

      // 4. Phát hiện BỎ SÓT VẬT THỂ (Missing Object): AI phát hiện tin cậy nhưng chưa có box nào
      if (!matchedBox) {
        const confPercent = Math.round(pred.confidence * 100);
        const isHighConf = pred.confidence >= 0.72;
        risks.push({
          id: `ai_3d:${frameNumber}:missing:${Math.round(px * 10)}_${Math.round(py * 10)}`,
          frame: frameNumber,
          object_id: null,
          label: pred.label,
          severity: isHighConf ? 'error' : 'warning',
          score: Math.min(96, Math.round(pred.confidence * 100)),
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
        continue;
      }

      // 5. Phát hiện NGHI VẤN SAI NHÃN (Label Mismatch): Có box nhưng nhãn khác với AI
      if (matchedBox && bestDist <= 1.8 && pred.confidence >= 0.70) {
        const boxLabel = String(matchedBox.label || matchedBox.type || '').toLowerCase();
        const predLabel = String(pred.label).toLowerCase();

        const isVehicle =
          (boxLabel.includes('veh') || boxLabel.includes('car') || boxLabel.includes('truck') || boxLabel.includes('bus')) &&
          (predLabel.includes('veh') || predLabel.includes('car') || predLabel.includes('truck') || predLabel.includes('bus'));

        const isPed =
          (boxLabel.includes('ped') || boxLabel.includes('person')) &&
          (predLabel.includes('ped') || predLabel.includes('person'));

        const isCyc =
          (boxLabel.includes('cyc') || boxLabel.includes('bike')) &&
          (predLabel.includes('cyc') || predLabel.includes('bike'));

        const isSame = isVehicle || isPed || isCyc || boxLabel === predLabel;

        if (!isSame) {
          const rawId = matchedBox.id?.includes(':') ? matchedBox.id.split(':')[1] : matchedBox.id;
          const displayLabel = matchedBox.label || matchedBox.type || 'Không xác định';
          risks.push({
            id: `ai_3d:${frameNumber}:mismatch:${rawId}`,
            frame: frameNumber,
            object_id: rawId,
            label: displayLabel,
            severity: 'warning',
            score: 75,
            confidence: pred.confidence,
            reasons: [
              `Nghi vấn sai nhãn: Anno gán "${displayLabel}" nhưng PointPillars phát hiện "${pred.label}" (${Math.round(pred.confidence * 100)}%)`,
            ],
            check_ids: ['ai_3d.label_mismatch'],
            bbox: null,
            source: 'ai',
            geometry_type: 'cuboid',
            cuboid: {
              center: matchedBox.center,
              size: matchedBox.size,
              heading: matchedBox.heading,
            },
            evidence: [
              {
                rule: 'ai_3d.label_mismatch',
                model: 'PointPillars',
                anno_label: displayLabel,
                ai_label: pred.label,
                confidence: pred.confidence,
              },
            ],
          });
        }
      }
    }
  }

  return risks;
}

