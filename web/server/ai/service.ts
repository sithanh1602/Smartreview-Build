import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { projectRoot } from '../config.ts';
import { ReviewError } from '../../shared/review.ts';
import { comparePredictions } from '../../core/risk/ai-compare.ts';
import type { AiFinding } from '../../core/risk/ai-compare.ts';
import type { Frame } from '../../core/schema/types.ts';
import type { ProjectService } from '../projects/service.ts';
import type { LoadedDataset } from '../types.ts';

// Job state as persisted to latest.json; a finished run adds the comparison to it.
interface AiJob {
  status: 'RUNNING' | 'READY' | 'FAILED';
  dataset_revision: string;
  started_at: string;
  completed: number;
  total: number;
  skipped_frames: number;
  [extra: string]: unknown;
}
const worker = fileURLToPath(new URL('./predict.py', import.meta.url));
export class AiService {
  projects: ProjectService;
  jobs: Map<string, AiJob>;
  active: boolean;
  results: Map<string, { at: number; state: AiJob | null }>;
  python: string;
  model: string;
  constructor(projects: ProjectService, options: { python?: string; model?: string } = {}) {
    this.projects = projects;
    this.jobs = new Map();
    this.active = false;
    this.results = new Map();
    this.python =
      options.python ||
      process.env.SMARTREVIEW_AI_PYTHON ||
      path.join(projectRoot, '.venv/bin/python');
    this.model =
      options.model ||
      process.env.SMARTREVIEW_AI_MODEL ||
      path.join(projectRoot, 'ai-service/yolo11n.pt');
  }
  directory(id: string) {
    return path.join(this.projects.storageRoot, 'projects', id, 'ai');
  }
  async available() {
    try {
      await fs.access(this.python);
      await fs.access(this.model);
      return true;
    } catch {
      return false;
    }
  }
  // With remote storage the latest result lives there, so every backend reads the same one.
  async saved(id: string): Promise<AiJob | null> {
    const remote = this.projects.remote;
    if (!remote) {
      try {
        return JSON.parse(await fs.readFile(path.join(this.directory(id), 'latest.json'), 'utf8'));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        return null;
      }
    }
    const cached = this.results.get(id);
    if (cached && Date.now() - cached.at < 60_000) return cached.state;
    const data = await this.projects.readRemote(`projects/${id}/ai/latest.json`);
    const state = data ? (JSON.parse(data.toString('utf8')) as AiJob) : null;
    this.results.set(id, { at: Date.now(), state });
    return state;
  }
  async status(id: string) {
    const { dataset } = await this.projects.context(id);
    const available = await this.available();
    if (this.jobs.has(id)) return { ...this.jobs.get(id), available };
    const saved = await this.saved(id);
    if (!saved || saved.dataset_revision !== dataset.meta.dataset_id)
      return { status: 'IDLE', available };
    if (saved.status === 'RUNNING')
      return {
        ...saved,
        status: 'FAILED',
        error: 'Lượt kiểm tra bị ngắt khi server dừng. Bấm chạy lại.',
        available,
      };
    return { ...saved, available };
  }
  async persist(id: string, state: AiJob) {
    const remote = this.projects.remote;
    if (remote) {
      // A running job is visible only on the backend running it; the remote keeps finished results.
      if (state.status === 'RUNNING') return;
      await remote.write(`projects/${id}/ai/latest.json`, Buffer.from(JSON.stringify(state)));
      this.results.set(id, { at: Date.now(), state: { ...state } });
      return;
    }
    const dir = this.directory(id);
    await fs.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, randomUUID() + '.tmp');
    await fs.writeFile(tmp, JSON.stringify(state));
    await fs.rename(tmp, path.join(dir, 'latest.json'));
  }
  async start(id: string) {
    const { dataset } = await this.projects.context(id);
    if (this.projects.deleting.has(id)) throw new ReviewError(409, 'Project đang được xóa.');
    if (this.active)
      throw new ReviewError(409, 'Một lượt AI đang chạy. Hãy chờ hoàn tất rồi thử lại.');
    // Claim synchronously before checking files to prevent concurrent runs.
    this.active = true;
    try {
      if (!(await this.available()))
        throw new ReviewError(
          503,
          'Chưa có Python hoặc model cục bộ. Xem docs/ai-check.md để cấu hình.',
        );
      const frames = dataset.normalized.frames.filter(
        (f) => dataset.assets.has(f.id) && !dataset.assets.get(f.id)!.endsWith('.svg'),
      );
      if (!frames.length) throw new ReviewError(422, 'Dataset chưa có ảnh phù hợp để chạy AI.');
      if (frames.length > 1000)
        throw new ReviewError(422, 'AI Check hỗ trợ tối đa 1000 ảnh mỗi lượt.');
      const state: AiJob = {
        status: 'RUNNING',
        dataset_revision: dataset.meta.dataset_id,
        started_at: new Date().toISOString(),
        completed: 0,
        total: frames.length,
        skipped_frames: dataset.normalized.frames.length - frames.length,
      };
      this.jobs.set(id, state);
      await this.persist(id, state);
      void this.run(id, dataset, frames, state);
      return { ...state, available: true };
    } catch (e) {
      this.active = false;
      this.jobs.delete(id);
      throw e;
    }
  }
  async run(id: string, dataset: LoadedDataset, frames: Frame[], state: AiJob) {
    const directory = this.projects.remote
      ? path.join(this.projects.storageRoot, '.tmp', randomUUID())
      : path.join(this.directory(id), randomUUID());
    try {
      await fs.mkdir(directory, { recursive: true });
      const input = path.join(directory, 'input.json'),
        output = path.join(directory, 'predictions.json');
      const paths = new Map<string, string>();
      // The model reads files, so remote frames are fetched into the run directory, which is removed afterwards.
      if (dataset.remote) {
        let next = 0;
        const fetchFrames = async () => {
          while (next < frames.length) {
            const index = next++,
              frame = frames[index];
            const data = await dataset.readAsset(frame.id);
            if (!data) throw new Error(`Không đọc được ảnh ${frame.id} từ kho lưu trữ chung.`);
            const file = path.join(
              directory,
              index + path.extname(dataset.assets.get(frame.id)!).toLowerCase(),
            );
            await fs.writeFile(file, data);
            paths.set(frame.id, file);
          }
        };
        await Promise.all(Array.from({ length: 4 }, fetchFrames));
      }
      await fs.writeFile(
        input,
        JSON.stringify({
          frames: frames.map((f) => ({
            id: f.id,
            path: paths.get(f.id) ?? dataset.assets.get(f.id),
          })),
        }),
      );
      await new Promise<void>((resolve, reject) => {
        const child = spawn(this.python, [worker, input, this.model, output], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, OMP_NUM_THREADS: '2', MKL_NUM_THREADS: '2' },
        });
        let pending = '',
          diagnostic = '';
        const timer = setTimeout(
          () => {
            child.kill('SIGKILL');
            reject(new Error('AI quá thời gian 20 phút. Thử dataset nhỏ hơn.'));
          },
          20 * 60 * 1000,
        );
        child.stdout.on('data', (chunk) => {
          pending = (pending + chunk.toString()).slice(-10000);
          const lines = pending.split('\n');
          pending = lines.pop()!;
          for (const line of lines) {
            try {
              const progress = JSON.parse(line);
              if (Number.isInteger(progress.completed))
                state.completed = Math.min(frames.length, Math.max(0, progress.completed));
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
          if (code === 0) resolve();
          else {
            console.error('AI worker failed:', diagnostic);
            reject(
              new Error(
                'Không chạy được model. Kiểm tra Python/Ultralytics trong docs/ai-check.md rồi thử lại.',
              ),
            );
          }
        });
      });
      const result = JSON.parse(await fs.readFile(output, 'utf8'));
      const processedIds = new Set(frames.map((f) => f.id));
      const comparison = comparePredictions(
        {
          ...dataset.normalized,
          annotations: dataset.normalized.annotations.filter((a) => processedIds.has(a.frame_id)),
        },
        result.predictions,
        result.labels,
      );
      const observations = new Map(dataset.allCases.map((a) => [a.id, a]));
      const frameById = new Map(dataset.normalized.frames.map((f) => [f.id, f]));
      const mediaById = new Map((dataset.normalized.media || []).map((m) => [m.id, m]));
      // A missing-object finding has no annotation, so describe the frame it belongs to.
      const frameObservation = (finding: AiFinding) => {
        const frame = frameById.get(finding.frame_id),
          m = frame && mediaById.get(frame.media_id);
        return {
          id: finding.id,
          annotation_id: null,
          frame_ref: finding.frame_id,
          frame_id: frame?.index,
          media_id: m?.id,
          media_name: m?.name,
          width: m?.width,
          height: m?.height,
          class_name: finding.prediction.label,
          geometry: finding.prediction.geometry,
          image_url: dataset.assets.has(finding.frame_id)
            ? `/api/projects/${id}/assets/${encodeURIComponent(finding.frame_id)}?dataset=${dataset.meta.dataset_id}`
            : null,
        };
      };
      Object.assign(state, {
        status: 'READY',
        finished_at: new Date().toISOString(),
        model: result.model,
        ...comparison,
        findings: comparison.findings.map((f) => ({
          ...f,
          observation:
            f.check_id === 'ai.missing_annotation'
              ? frameObservation(f)
              : observations.get(f.annotation_id!),
        })),
      });
      await this.persist(id, state);
    } catch (e) {
      Object.assign(state, {
        status: 'FAILED',
        error: (e as Error).message,
        finished_at: new Date().toISOString(),
      });
      try {
        await this.persist(id, state);
      } catch {
        console.error('Unable to persist AI failure');
      }
    } finally {
      this.active = false;
      this.jobs.delete(id);
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  }
}
