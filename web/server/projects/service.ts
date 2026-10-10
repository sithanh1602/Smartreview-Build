import { AiService } from '../ai/service.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { importAnnotations, importers } from '../../core/importers/index.ts';
import { applyEnvRisk, parseImageTable } from '../../core/importers/signals.ts';
import { normalizeDataset } from '../../core/schema/normalize.ts';
import { LEGACY_ENGINE_VERSION, LATEST_ENGINE_VERSION } from '../../core/risk/engine.ts';
import { loadDataset } from '../repository.ts';
import { ReviewStore } from '../reviews/store.ts';
import { ReviewError } from '../../shared/review.ts';
import { receiveUpload, safePath } from './upload.ts';
import { pack, unpack } from '../storage/archive.ts';
import type { RemoteStorage } from '../storage/remote.ts';
import type { Untrusted } from '../../shared/review.ts';
import type { Dataset } from '../../core/schema/types.ts';
import type { Connection, Db, LoadedDataset, ProjectContext, Req, Result, Rows } from '../types.ts';

type ProjectRow = Rows[number];
const STORAGE_KEY = /^projects\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/;
const publicProject = ({
  dataset_path,
  dataset_revision_id,
  demo_key,
  storage_provider,
  storage_key,
  storage_synced_at,
  ...row
}: ProjectRow) => row;
export class ProjectService {
  pool: Db;
  storageRoot: string;
  cache: Map<string, Promise<ProjectContext>>;
  deleting: Set<string>;
  ai: AiService;
  remote: RemoteStorage | null;
  demos: Map<string, string>;
  constructor(pool: Db, storageRoot: string, remote: RemoteStorage | null = null) {
    this.pool = pool;
    this.storageRoot = path.resolve(storageRoot);
    this.remote = remote;
    this.cache = new Map();
    this.deleting = new Set();
    this.demos = new Map();
    this.ai = new AiService(this);
  }
  async recover() {
    await this.pool.query<Rows>(
      "UPDATE projects SET status='FAILED',error_message='Import bị ngắt khi server dừng. Chọn lại files để thử lại.' WHERE status IN ('UPLOADING','VALIDATING','NORMALIZING','ANALYZING')",
    );
  }
  async row(id: string): Promise<ProjectRow> {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new ReviewError(404, 'Project không tồn tại.');
    const [[row]] = await this.pool.execute<Rows>('SELECT * FROM projects WHERE id=?', [id]);
    if (!row) throw new ReviewError(404, 'Project không tồn tại.');
    return row;
  }
  async get(id: string) {
    return publicProject(await this.row(id));
  }
  async remove(id: string) {
    await this.row(id);
    if (this.deleting.has(id)) throw new ReviewError(409, 'Project đang được xóa.');
    this.deleting.add(id);
    let c: Connection | undefined, staged: string | undefined;
    const directory = path.join(this.storageRoot, 'projects', id);
    try {
      c = await this.pool.getConnection();
      await c.beginTransaction();
      const [[row]] = await c.execute<Rows>('SELECT * FROM projects WHERE id=? FOR UPDATE', [id]);
      if (!row) throw new ReviewError(404, 'Project không tồn tại.');
      if (row.demo_key) throw new ReviewError(409, 'Không thể xóa dataset demo mặc định.');
      if (!['CREATED', 'FAILED', 'READY'].includes(row.status) || this.ai.active)
        throw new ReviewError(409, 'Chờ import hoặc AI Check hoàn tất trước khi xóa.');
      const trash = path.join(this.storageRoot, '.trash');
      await fs.mkdir(trash, { recursive: true });
      const target = path.join(trash, randomUUID());
      try {
        await fs.rename(directory, target);
        staged = target;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
      await c.execute<Rows>('DELETE FROM projects WHERE id=?', [id]);
      if (row.dataset_revision_id) {
        const revision = row.dataset_revision_id;
        await c.execute<Rows>(
          'DELETE d FROM review_decisions d JOIN risk_cases r ON r.id=d.risk_case_id WHERE r.dataset_revision_id=?',
          [revision],
        );
        await c.execute<Rows>('DELETE FROM frame_reviews WHERE dataset_revision_id=?', [revision]);
        await c.execute<Rows>('DELETE FROM risk_cases WHERE dataset_revision_id=?', [revision]);
        await c.execute<Rows>('DELETE FROM dataset_revisions WHERE id=?', [revision]);
      }
      await c.commit();
    } catch (e) {
      if (c) await c.rollback();
      if (staged) await fs.rename(staged, directory);
      throw e;
    } finally {
      c?.release();
      this.deleting.delete(id);
    }
    this.cache.delete(id);
    let cleanupPending = false;
    if (staged) {
      try {
        await fs.rm(staged, { recursive: true, force: true });
      } catch {
        cleanupPending = true;
        console.error('Project trash cleanup pending:', staged);
      }
    }
    if (this.remote) {
      try {
        await this.remote.remove(`projects/${id}`);
      } catch (e) {
        cleanupPending = true;
        console.error('Remote project cleanup pending:', id, (e as Error).message);
      }
    }
    return { deleted: true, cleanupPending };
  }
  async list() {
    const [rows] = await this.pool.query<Rows>(
      'SELECT * FROM projects ORDER BY created_at DESC, id',
    );
    return rows.map(publicProject);
  }
  async create(input: Untrusted) {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some((k) => !['name', 'description', 'format'].includes(k))
    )
      throw new ReviewError(400, 'Invalid project fields.');
    const { name, description = '', format } = input;
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.trim().length > 160 ||
      typeof description !== 'string' ||
      description.length > 2000
    )
      throw new ReviewError(400, 'Tên project 1–160 ký tự; mô tả tối đa 2000 ký tự.');
    if (!Object.hasOwn(importers, format)) throw new ReviewError(400, 'Format chưa được hỗ trợ.');
    const id = randomUUID();
    await this.pool.execute<Rows>(
      'INSERT INTO projects(id,name,description,format) VALUES (?,?,?,?)',
      [id, name.trim(), description, format],
    );
    return this.get(id);
  }
  async registerDemo(dataset: LoadedDataset, reviews: ReviewStore, datasetPath: string) {
    const id = randomUUID();
    // The stored path belongs to whichever machine registered the demo first.
    this.demos.set(dataset.meta.dataset_id, path.resolve(datasetPath));
    await this.pool.execute<Rows>(
      "INSERT INTO projects(id,name,description,format,status,dataset_path,dataset_revision_id,metadata,demo_key) VALUES (?,?,?,'smartreview-json','READY',?,?,?,?) ON DUPLICATE KEY UPDATE id=id",
      [
        id,
        dataset.meta.dataset_reference === 'traffic-demo' ? 'Traffic Demo' : dataset.meta.name,
        'Dataset demo hiện có; giữ nguyên quyết định review.',
        path.resolve(datasetPath),
        reviews.datasetId,
        JSON.stringify(dataset.meta),
        dataset.meta.dataset_id,
      ],
    );
    const [[row]] = await this.pool.execute<Rows>(
      'SELECT id FROM projects WHERE dataset_revision_id=?',
      [reviews.datasetId],
    );
    return row.id as string;
  }
  async push(key: string) {
    const tmp = path.join(this.storageRoot, '.tmp');
    await fs.mkdir(tmp, { recursive: true });
    const archive = path.join(tmp, randomUUID() + '.tar');
    try {
      await pack(path.join(this.storageRoot, key), archive);
      await this.remote!.upload(key + '.tar', archive);
    } finally {
      await fs.rm(archive, { force: true });
    }
  }
  async pull(key: string) {
    const tmp = path.join(this.storageRoot, '.tmp');
    await fs.mkdir(tmp, { recursive: true });
    const archive = path.join(tmp, randomUUID() + '.tar'),
      staging = path.join(tmp, randomUUID());
    try {
      if (!(await this.remote!.download(key + '.tar', archive)))
        throw new ReviewError(409, 'Không tìm thấy dữ liệu project trên kho lưu trữ chung.');
      await fs.mkdir(staging, { mode: 0o700 });
      await unpack(archive, staging);
      const directory = path.join(this.storageRoot, key);
      await fs.mkdir(path.dirname(directory), { recursive: true });
      await fs.rename(staging, directory);
    } catch (e) {
      if (e instanceof ReviewError) throw e;
      console.error('Remote project download failed:', (e as Error).message);
      throw new ReviewError(
        502,
        'Không tải được dữ liệu project từ kho lưu trữ chung. Kiểm tra mạng và cấu hình Dropbox.',
      );
    } finally {
      await fs.rm(archive, { force: true });
      await fs.rm(staging, { recursive: true, force: true });
    }
  }
  // Shared projects sit under storage_key on every machine; the archive is fetched once, then read from disk.
  async datasetFile(row: ProjectRow): Promise<string> {
    if (row.demo_key && this.demos.has(row.demo_key)) return this.demos.get(row.demo_key)!;
    if (!row.storage_key) return row.dataset_path;
    if (!STORAGE_KEY.test(row.storage_key) || !row.storage_key.startsWith(`projects/${row.id}/`))
      throw new ReviewError(409, 'Storage key của project không hợp lệ.');
    const file = path.join(this.storageRoot, row.storage_key, 'dataset.json');
    try {
      await fs.access(file);
      return file;
    } catch {}
    if (!this.remote || row.storage_provider !== this.remote.name)
      throw new ReviewError(
        409,
        `Dữ liệu project nằm trên ${row.storage_provider}. Cấu hình SMARTREVIEW_REMOTE_STORAGE trong .env để tải về.`,
      );
    await this.pull(row.storage_key);
    return file;
  }
  // One-off for projects imported before shared storage: publish the local copy and record its key.
  async share(id: string) {
    const row = await this.row(id);
    if (!this.remote) throw new Error('Remote storage is not configured.');
    if (row.status !== 'READY' || row.demo_key || row.storage_key) return false;
    const key = path
      .relative(this.storageRoot, path.dirname(row.dataset_path))
      .split(path.sep)
      .join('/');
    if (!STORAGE_KEY.test(key) || !key.startsWith(`projects/${id}/`)) return false;
    try {
      await fs.access(row.dataset_path);
    } catch {
      return false;
    }
    await this.push(key);
    await this.pool.execute<Rows>(
      'UPDATE projects SET storage_provider=?,storage_key=?,storage_synced_at=UTC_TIMESTAMP(3) WHERE id=? AND storage_key IS NULL',
      [this.remote.name, key, id],
    );
    return true;
  }
  async context(id: string): Promise<ProjectContext> {
    const row = await this.row(id);
    if (row.status !== 'READY')
      throw new ReviewError(409, 'Project chưa READY. Xem trạng thái import.');
    if (!this.cache.has(id)) {
      const pending = (async () => {
        // The engine version is fixed at import time. Projects created before versioning
        // have none stored and keep the legacy 2.0.0 profile, so their fingerprint and scores never change.
        const stored = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
        const dataset = await loadDataset(await this.datasetFile(row), {
          namespace: row.demo_key ? '' : id,
          apiPrefix: `/api/projects/${id}`,
          engineVersion: stored?.engine_version || LEGACY_ENGINE_VERSION,
        }).catch((e) => {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || row.storage_key) throw e;
          throw new ReviewError(
            409,
            'Project này chỉ có dữ liệu trên máy đã import. Chạy npm run storage:push trên máy đó để chia sẻ.',
          );
        });
        dataset.meta.project_name = row.name;
        const reviews = new ReviewStore(this.pool, dataset);
        // Persisted revision is the authority. Never silently replace it at read time.
        const [[revision]] = await this.pool.execute<Rows>(
          'SELECT fingerprint FROM dataset_revisions WHERE id=?',
          [row.dataset_revision_id],
        );
        if (!revision || revision.fingerprint !== dataset.meta.dataset_id)
          throw new ReviewError(
            409,
            'Dataset trên disk đã thay đổi. Tạo project mới để import lại.',
          );
        reviews.datasetId = row.dataset_revision_id;
        return { dataset, reviews };
      })();
      this.cache.set(id, pending);
      pending.catch(() => this.cache.delete(id));
    }
    return this.cache.get(id)!;
  }
  async status(id: string, status: string, error: string | null = null) {
    await this.pool.execute<Rows>('UPDATE projects SET status=?,error_message=? WHERE id=?', [
      status,
      error,
      id,
    ]);
  }
  async import(id: string, req: Req) {
    const row = await this.row(id);
    const [claimed] = await this.pool.execute<Result>(
      "UPDATE projects SET status='UPLOADING',error_message=NULL WHERE id=? AND status IN ('CREATED','FAILED')",
      [id],
    );
    if (!claimed.affectedRows)
      throw new ReviewError(
        409,
        'Project đang import hoặc đã READY. Tạo project mới cho dataset khác.',
      );
    const key = `projects/${id}/${randomUUID()}`;
    const directory = path.join(this.storageRoot, key);
    try {
      const uploaded = await receiveUpload(req, directory, row.format);
      await this.status(id, 'VALIDATING');
      const text = await fs.readFile(uploaded.annotation, 'utf8');
      let data: Dataset;
      try {
        data = importAnnotations(row.format, text, { id, name: row.name });
        if (uploaded.metadata)
          applyEnvRisk(data, parseImageTable(await fs.readFile(uploaded.metadata, 'utf8')));
      } catch (e) {
        throw new ReviewError(422, (e as Error).message.slice(0, 1000));
      }
      if (data.annotations.length > 100000 || data.frames.length > 10000)
        throw new ReviewError(422, 'MVP hỗ trợ tối đa 100000 annotations và 10000 frames.');
      await this.status(id, 'NORMALIZING');
      const used = new Set<string>();
      const mediaById = new Map(data.media.map((m) => [m.id, m]));
      for (const f of data.frames) {
        if (!f.image) throw new ReviewError(422, `Frame ${f.id} thiếu image reference.`);
        const ref = safePath(
          ['cvat-images', 'coco-detection'].includes(row.format)
            ? f.image.slice('images/'.length)
            : f.image,
        );
        // Exact relative path first; a unique basename allows selecting a flat set of files.
        const matches = [...uploaded.media.keys()].filter(
          (k) => path.posix.basename(k) === path.posix.basename(ref),
        );
        const key = uploaded.media.has(ref) ? ref : matches.length === 1 ? matches[0] : null;
        if (!key) throw new ReviewError(422, `Thiếu ảnh hoặc tên ảnh không duy nhất: ${ref}`);
        const actual = uploaded.dimensions.get(key)!,
          declared = mediaById.get(f.media_id)!;
        if (actual.width !== declared.width || actual.height !== declared.height)
          throw new ReviewError(
            422,
            `Kích thước ảnh ${ref} không khớp annotation (${actual.width}×${actual.height} thực tế).`,
          );
        used.add(key);
        f.image = 'media/' + key;
      }
      if (used.size !== uploaded.media.size)
        throw new ReviewError(
          422,
          'Có ảnh upload không được annotation tham chiếu. Chỉ chọn ảnh của dataset.',
        );
      for (const a of data.annotations) {
        const g = a.geometry;
        if (g.type === 'bbox' && (g.width <= 0 || g.height <= 0))
          throw new ReviewError(422, `BBox ${a.id}: width và height phải > 0.`);
      }
      data = normalizeDataset(data);
      const datasetPath = path.join(directory, 'dataset.json');
      await fs.writeFile(datasetPath, JSON.stringify(data, null, 2), {
        flag: 'wx',
      });
      await this.status(id, 'ANALYZING');
      const dataset = await loadDataset(datasetPath, {
        namespace: id,
        apiPrefix: `/api/projects/${id}`,
        engineVersion: LATEST_ENGINE_VERSION,
      });
      dataset.meta.project_name = row.name;
      await fs.mkdir(path.join(directory, 'risk'));
      await fs.writeFile(
        path.join(directory, 'risk', 'report.json'),
        JSON.stringify(dataset.report, null, 2),
      );
      // Publish before the project turns READY so other backends never see a project without data.
      if (this.remote) await this.push(key);
      const reviews = new ReviewStore(this.pool, dataset);
      await reviews.initialize();
      // dataset_path stays for backends that predate shared storage; without a remote the project is local-only.
      await this.pool.execute<Rows>(
        "UPDATE projects SET status='READY',dataset_path=?,dataset_revision_id=?,metadata=?,error_message=NULL,storage_provider=?,storage_key=?,storage_synced_at=? WHERE id=?",
        [
          datasetPath,
          reviews.datasetId,
          JSON.stringify(dataset.meta),
          this.remote?.name ?? 'local',
          this.remote ? key : null,
          this.remote ? new Date().toISOString().slice(0, 23).replace('T', ' ') : null,
          id,
        ],
      );
      this.cache.set(id, Promise.resolve({ dataset, reviews }));
      return this.get(id);
    } catch (e) {
      await this.status(
        id,
        'FAILED',
        e instanceof ReviewError
          ? e.message
          : 'Không thể xử lý import. Kiểm tra storage/MySQL rồi thử lại.',
      );
      await fs.rm(directory, { recursive: true, force: true });
      throw e;
    }
  }
}
