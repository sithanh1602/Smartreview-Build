import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ReviewError } from '../../shared/review.ts';
import {
  combineWithRisk,
  SECOND_ENGINE,
  secondLook,
  VERIFIER_ENGINE,
  verifierReport,
  verifierRequest,
} from '../../core/risk/label-verify.ts';
import type {
  CombinedFinding,
  CombinedReport,
  VerifierEngine,
} from '../../core/risk/label-verify.ts';
import type { Frame } from '../../core/schema/types.ts';
import type { ProjectService } from '../projects/service.ts';
import type { LoadedDataset, ProjectContext } from '../types.ts';
import { addToQueue } from './queue.ts';
import { labelVerifier } from './label-verifier.ts';

// Job state as persisted to latest.json; a finished run adds the combined report to it.
interface VerifyJob {
  status: 'RUNNING' | 'READY' | 'FAILED';
  dataset_revision: string;
  started_at: string;
  // The engine at work and its boxes: the second engine starts a count of its own.
  stage: VerifierEngine;
  second: boolean;
  completed: number;
  total: number;
  [extra: string]: unknown;
}
const MAX_FRAMES = 1000;
const TIMEOUT_MS = 30 * 60 * 1000;

// The label scan of a project (docs/label-verifier.md). It runs once, when the data is put up
// and the person chooses how errors are found: the default engine looks at every box the Risk
// Engine scores, the second engine looks again only when asked for, and the boxes found wrong
// join the project's review queue.
export class VerifyService {
  projects: ProjectService;
  verifier: Pick<ReturnType<typeof labelVerifier>, 'available' | 'run'>;
  jobs: Map<string, VerifyJob>;
  active: boolean;
  results: Map<string, { at: number; state: VerifyJob | null }>;
  // Scans asked for while the project was still being imported, or while another run held the
  // engine: each starts once its project is READY and the engine is free.
  pending: Map<string, { second: boolean }>;
  constructor(projects: ProjectService, options: { verifier?: VerifyService['verifier'] } = {}) {
    this.projects = projects;
    this.verifier = options.verifier ?? labelVerifier();
    this.jobs = new Map();
    this.active = false;
    this.results = new Map();
    this.pending = new Map();
  }
  directory(id: string) {
    return path.join(this.projects.storageRoot, 'projects', id, 'verify');
  }
  // With remote storage the latest result lives there, so every backend reads the same one.
  async saved(id: string): Promise<VerifyJob | null> {
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
    const data = await this.projects.readRemote(`projects/${id}/verify/latest.json`);
    const state = data ? (JSON.parse(data.toString('utf8')) as VerifyJob) : null;
    this.results.set(id, { at: Date.now(), state });
    return state;
  }
  async status(id: string) {
    const { dataset } = await this.projects.context(id);
    const about = {
      available: await this.verifier.available(),
      queued: this.pending.has(id),
      engine: VERIFIER_ENGINE,
      second_engine: SECOND_ENGINE,
    };
    if (this.jobs.has(id)) return { ...this.jobs.get(id), ...about };
    const saved = await this.saved(id);
    if (!saved || saved.dataset_revision !== dataset.meta.dataset_id)
      return { status: 'IDLE', ...about };
    if (saved.status === 'RUNNING')
      return {
        ...saved,
        status: 'FAILED',
        error: 'Lượt kiểm nhãn bị ngắt khi server dừng. Bấm chạy lại.',
        ...about,
      };
    return { ...saved, ...about };
  }
  async persist(id: string, state: VerifyJob) {
    const remote = this.projects.remote;
    if (remote) {
      // A running job is visible only on the backend running it; the remote keeps finished results.
      if (state.status === 'RUNNING') return;
      await remote.write(`projects/${id}/verify/latest.json`, Buffer.from(JSON.stringify(state)));
      this.results.set(id, { at: Date.now(), state: { ...state } });
      return;
    }
    const dir = this.directory(id);
    await fs.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, randomUUID() + '.tmp');
    await fs.writeFile(tmp, JSON.stringify(state));
    await fs.rename(tmp, path.join(dir, 'latest.json'));
  }
  // What the person creating a project chose in the upload popup. The import may still be
  // finishing on the backend, so the scan waits for it instead of making the person wait.
  async request(id: string, options: { second?: boolean } = {}) {
    if (!(await this.verifier.available()))
      throw new ReviewError(
        503,
        'Chưa có Python của label verifier. Xem docs/label-verifier.md để cài.',
      );
    const { status } = await this.projects.get(id);
    if (status === 'CREATED' || status === 'FAILED')
      throw new ReviewError(409, 'Project chưa có dữ liệu để kiểm nhãn.');
    // One scan for one upload: a failed run may be tried again, a finished one may not.
    const done = 'Dữ liệu này đã được quét nhãn; lượt quét chỉ chạy một lần khi đưa dữ liệu lên.';
    if (this.pending.has(id) || this.jobs.has(id)) throw new ReviewError(409, done);
    if (status === 'READY') {
      const { dataset } = await this.projects.context(id);
      const saved = await this.saved(id);
      if (saved?.status === 'READY' && saved.dataset_revision === dataset.meta.dataset_id)
        throw new ReviewError(409, done);
      if (!this.active) return this.start(id, options);
    }
    this.pending.set(id, { second: options.second === true });
    // The import may have finished between the two lines above.
    void this.drain();
    return {
      status: 'IDLE',
      available: true,
      queued: true,
      engine: VERIFIER_ENGINE,
      second_engine: SECOND_ENGINE,
    };
  }
  // Starts the next waiting scan whose project is ready. Called when an import finishes and
  // when a run ends.
  async drain() {
    for (const [id, options] of this.pending) {
      if (this.active) return;
      try {
        if ((await this.projects.get(id)).status !== 'READY') continue;
        this.pending.delete(id);
        await this.start(id, options);
      } catch (e) {
        this.pending.delete(id);
        console.error('Queued label verify not started:', id, (e as Error).message);
      }
    }
  }
  // Puts the finished scan of this dataset into its review queue. Called when a scan ends and
  // each time the project's dataset is loaded again, since the queue is rebuilt from the Risk
  // Engine's report then.
  async apply(id: string, { dataset, reviews }: ProjectContext) {
    const saved = await this.saved(id);
    if (saved?.status !== 'READY' || saved.dataset_revision !== dataset.meta.dataset_id) return;
    const changed = addToQueue(dataset, saved.findings as CombinedFinding[]);
    if (changed.length) await reviews?.requeue(changed);
  }
  // `second`: the person asked for the second engine to look again at the doubted boxes.
  async start(id: string, { second = false }: { second?: boolean } = {}) {
    const { dataset } = await this.projects.context(id);
    if (this.projects.deleting.has(id)) throw new ReviewError(409, 'Project đang được xóa.');
    if (this.active)
      throw new ReviewError(409, 'Một lượt kiểm nhãn đang chạy. Hãy chờ hoàn tất rồi thử lại.');
    // Claim synchronously before checking files to prevent concurrent runs.
    this.active = true;
    try {
      if (!(await this.verifier.available()))
        throw new ReviewError(
          503,
          'Chưa có Python của label verifier. Xem docs/label-verifier.md để cài.',
        );
      const frames = dataset.normalized.frames.filter(
        (f) => dataset.assets.has(f.id) && !dataset.assets.get(f.id)!.endsWith('.svg'),
      );
      if (!frames.length) throw new ReviewError(422, 'Dataset chưa có ảnh phù hợp để kiểm nhãn.');
      if (frames.length > MAX_FRAMES)
        throw new ReviewError(422, `Kiểm nhãn hỗ trợ tối đa ${MAX_FRAMES} ảnh mỗi lượt.`);
      const state: VerifyJob = {
        status: 'RUNNING',
        dataset_revision: dataset.meta.dataset_id,
        started_at: new Date().toISOString(),
        stage: VERIFIER_ENGINE,
        second,
        completed: 0,
        total: 0,
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
  async run(id: string, dataset: LoadedDataset, frames: Frame[], state: VerifyJob) {
    const directory = path.join(this.projects.storageRoot, '.tmp', randomUUID());
    try {
      const paths = new Map(frames.map((f) => [f.id, dataset.assets.get(f.id)!]));
      // The engines read files, so remote frames are fetched into a directory removed afterwards.
      if (dataset.remote) {
        await fs.mkdir(directory, { recursive: true });
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
      const risk = new Map(dataset.report.results.map((r) => [r.reference.annotation_id, r]));
      const look = async (engine: VerifierEngine, only?: Set<string>) => {
        const { request, skipped } = verifierRequest(
          dataset.normalized,
          (frame) => paths.get(frame.id),
          engine,
          { state: (annotationId) => risk.get(annotationId)?.state, only },
        );
        Object.assign(state, { stage: engine, completed: 0, total: request.boxes.length });
        const response = request.boxes.length
          ? await this.verifier.run(
              request,
              (done) => (state.completed = Math.min(request.boxes.length, done)),
              TIMEOUT_MS,
            )
          : { engine, model: request.model, results: [], skipped: [] };
        return verifierReport(dataset.normalized, response, skipped);
      };
      const first = await look(VERIFIER_ENGINE);
      const again = secondLook(first);
      const second = state.second && again.size ? await look(SECOND_ENGINE, again) : undefined;
      const combined: CombinedReport = combineWithRisk(
        first,
        (annotationId) => risk.get(annotationId)?.score ?? 0,
        second,
      );
      const observations = new Map(dataset.allCases.map((a) => [a.annotation_id, a]));
      Object.assign(state, {
        status: 'READY',
        finished_at: new Date().toISOString(),
        ...combined,
        findings: combined.findings.map((f) => ({
          ...f,
          observation: observations.get(f.annotation_id),
        })),
      });
      await this.persist(id, state);
      await this.apply(id, await this.projects.context(id));
    } catch (e) {
      console.error('Label verifier failed:', (e as Error).message);
      Object.assign(state, {
        status: 'FAILED',
        // The engine's own output stays in the server log; the reader gets the cause it names.
        error: /out of memory/i.test((e as Error).message)
          ? 'GPU của máy chủ không đủ bộ nhớ trống cho mô hình. Đóng chương trình khác đang dùng GPU rồi chạy lại.'
          : 'Không chạy được label verifier. Kiểm tra cài đặt trong docs/label-verifier.md.',
        finished_at: new Date().toISOString(),
      });
      try {
        await this.persist(id, state);
      } catch {
        console.error('Unable to persist label verifier failure');
      }
    } finally {
      this.active = false;
      this.jobs.delete(id);
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
      void this.drain();
    }
  }
}
