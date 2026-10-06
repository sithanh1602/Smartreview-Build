import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { projectRoot } from '../config.mjs';
import { ReviewError } from '../../shared/review.mjs';
import { comparePredictions } from '../../core/risk/ai-compare.mjs';
const worker = fileURLToPath(new URL('./predict.py', import.meta.url));
export class AiService {
  constructor(projects, options = {}) {
    this.projects = projects;
    this.jobs = new Map();
    this.active = false;
    this.python =
      options.python ||
      process.env.SMARTREVIEW_AI_PYTHON ||
      path.join(projectRoot, '.venv/bin/python');
    this.model =
      options.model ||
      process.env.SMARTREVIEW_AI_MODEL ||
      path.join(projectRoot, 'ai-service/yolo11n.pt');
  }
  directory(id) {
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
  async status(id) {
    const { dataset } = await this.projects.context(id);
    const available = await this.available();
    if (this.jobs.has(id)) return { ...this.jobs.get(id), available };
    try {
      const saved = JSON.parse(
        await fs.readFile(path.join(this.directory(id), 'latest.json'), 'utf8'),
      );
      if (saved.dataset_revision !== dataset.meta.dataset_id) return { status: 'IDLE', available };
      if (saved.status === 'RUNNING')
        return {
          ...saved,
          status: 'FAILED',
          error: 'Lượt kiểm tra bị ngắt khi server dừng. Bấm chạy lại.',
          available,
        };
      return { ...saved, available };
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      return { status: 'IDLE', available };
    }
  }
  async persist(id, state) {
    const dir = this.directory(id);
    await fs.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, randomUUID() + '.tmp');
    await fs.writeFile(tmp, JSON.stringify(state));
    await fs.rename(tmp, path.join(dir, 'latest.json'));
  }
  async start(id) {
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
        (f) => dataset.assets.has(f.id) && !dataset.assets.get(f.id).endsWith('.svg'),
      );
      if (!frames.length) throw new ReviewError(422, 'Dataset chưa có ảnh phù hợp để chạy AI.');
      if (frames.length > 1000)
        throw new ReviewError(422, 'AI Check hỗ trợ tối đa 1000 ảnh mỗi lượt.');
      const state = {
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
  async run(id, dataset, frames, state) {
    const directory = path.join(this.directory(id), randomUUID());
    try {
      await fs.mkdir(directory, { recursive: true });
      const input = path.join(directory, 'input.json'),
        output = path.join(directory, 'predictions.json');
      await fs.writeFile(
        input,
        JSON.stringify({
          frames: frames.map((f) => ({
            id: f.id,
            path: dataset.assets.get(f.id),
          })),
        }),
      );
      await new Promise((resolve, reject) => {
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
          pending = lines.pop();
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
      Object.assign(state, {
        status: 'READY',
        finished_at: new Date().toISOString(),
        model: result.model,
        ...comparison,
        findings: comparison.findings.map((f) => ({
          ...f,
          observation: observations.get(f.annotation_id),
        })),
      });
      await this.persist(id, state);
    } catch (e) {
      Object.assign(state, {
        status: 'FAILED',
        error: e.message,
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
