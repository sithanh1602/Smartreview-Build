import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { projectRoot } from '../config.ts';
import { getCvatFrameImage } from './client.ts';
import type { BBox } from '../../core/schema/types.ts';

export interface YoloPrediction {
  frame_id: string;
  frame_index: number;
  label: string;
  confidence: number;
  geometry: BBox;
}

export interface YoloResult {
  predictions: YoloPrediction[];
  labels: string[];
  model: string;
  available: boolean;
}

const runnerScript = fileURLToPath(new URL('./yolo_runner.py', import.meta.url));

export async function getYoloPaths() {
  const python =
    process.env.SMARTREVIEW_AI_PYTHON || path.join(projectRoot, '.venv/bin/python');
  const candidateModels = [
    process.env.SMARTREVIEW_AI_MODEL,
    path.join(projectRoot, 'ai-service/yolo11n.pt'),
    path.join(projectRoot, 'ai-service/yolo11s.pt'),
    path.join(projectRoot, '.venv/models/yolo11n.pt'),
    path.join(projectRoot, '.venv/models/yolo11s.pt'),
    path.join(projectRoot, 'yolo11n.pt'),
    path.join(projectRoot, 'yolo11s.pt'),
  ].filter(Boolean) as string[];

  let model = candidateModels[0] || path.join(projectRoot, 'ai-service/yolo11n.pt');
  for (const m of candidateModels) {
    try {
      await fs.access(m);
      model = m;
      break;
    } catch {}
  }

  try {
    await fs.access(python);
    await fs.access(runnerScript);
    return { python, model, available: true };
  } catch {
    return { python, model, available: false };
  }
}

import { queueService } from '../queue/index.ts';

/**
 * Downloads frames from CVAT and runs YOLO detection on them.
 */
export async function runYoloOnJobFrames(
  jobId: number,
  frameNumbers: number[],
  frameIdBuilder: (frameNumber: number) => string,
  onProgress?: (done: number, total: number) => void,
): Promise<YoloResult> {
  const { python, model, available } = await getYoloPaths();
  if (!available) {
    return { predictions: [], labels: [], model: 'none', available: false };
  }

  return queueService.runAiTask(
    `YOLO 2D (Job #${jobId})`,
    async () => {
      const cacheDir = path.join('/tmp', 'smartreview_cvat_frames', String(jobId));
      await fs.mkdir(cacheDir, { recursive: true });

      const manifestFrames: { id: string; index: number; path: string }[] = [];

      // Limit to max 30 frames per scan for responsiveness if job is huge
      const targetFrames = Array.from(new Set(frameNumbers)).slice(0, 30);

      await Promise.all(
        targetFrames.map(async (frameNum) => {
          const framePath = path.join(cacheDir, `frame_${frameNum}.jpg`);
          try {
            const stat = await fs.stat(framePath);
            if (stat.size <= 0) throw new Error('empty');
          } catch {
            // Download from CVAT
            const buffer = await getCvatFrameImage(jobId, frameNum);
            await fs.writeFile(framePath, buffer);
          }
          manifestFrames.push({
            id: frameIdBuilder(frameNum),
            index: frameNum,
            path: framePath,
          });
        }),
      );

      if (!manifestFrames.length) {
        return { predictions: [], labels: [], model: path.basename(model), available: true };
      }

      const runId = randomUUID();
      const manifestPath = path.join(cacheDir, `manifest_${runId}.json`);
      const outputPath = path.join(cacheDir, `output_${runId}.json`);

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
            else reject(new Error(`YOLO runner failed (code ${code}): ${err}`));
          });
          child.on('error', reject);
        });

        const raw = await fs.readFile(outputPath, 'utf8');
        const parsed = JSON.parse(raw);
        return {
          predictions: parsed.predictions ?? [],
          labels: parsed.labels ?? [],
          model: parsed.model ?? path.basename(model),
          available: true,
        };
      } finally {
        await Promise.all([
          fs.unlink(manifestPath).catch(() => {}),
          fs.unlink(outputPath).catch(() => {}),
        ]);
      }
    },
    { model: 'YOLO', jobId, frameCount: frameNumbers.length },
  );
}
