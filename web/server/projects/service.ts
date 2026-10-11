import { AiService } from '../ai/service.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { importAnnotations, importers } from '../../core/importers/index.ts';
import { applyEnvRisk, parseImageTable } from '../../core/importers/signals.ts';
import { normalizeDataset } from '../../core/schema/normalize.ts';
import { LEGACY_ENGINE_VERSION, LATEST_ENGINE_VERSION, checksFor } from '../../core/risk/engine.ts';
import { waiversFrom } from '../../shared/guideline-waivers.ts';
import { buildDataset, loadDataset } from '../repository.ts';
import { ReviewStore } from '../reviews/store.ts';
import { ReviewError } from '../../shared/review.ts';
import { receiveUpload, safePath } from './upload.ts';
import type { RemoteStorage } from '../storage/remote.ts';
import type { AssetSource, DatasetOptions } from '../repository.ts';
import type { Untrusted } from '../../shared/review.ts';
import type { Dataset } from '../../core/schema/types.ts';
import type { Connection, Db, LoadedDataset, ProjectContext, Req, Result, Rows } from '../types.ts';

type ProjectRow = Rows[number];
const STORAGE_KEY = /^projects\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/;
// Frames fetched from the remote stay in memory only; nothing is written to disk.
const ASSET_CACHE_BYTES = 64 * 1024 * 1024;
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
  assets: Map<string, Buffer>;
  assetBytes: number;
  constructor(pool: Db, storageRoot: string, remote: RemoteStorage | null = null) {
    this.pool = pool;
    this.storageRoot = path.resolve(storageRoot);
    this.remote = remote;
    this.cache = new Map();
    this.deleting = new Set();
    this.demos = new Map();
    this.assets = new Map();
    this.assetBytes = 0;
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
  // Every file of an import directory goes to the remote under the same relative path.
  async publish(key: string) {
    const directory = path.join(this.storageRoot, key);
    const entries = await fs.readdir(directory, { recursive: true, withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => {
        const file = path.join(e.parentPath, e.name);
        const relative = path.relative(directory, file).split(path.sep).join('/');
        return { file, key: `${key}/${relative}` };
      });
    // Dropbox paths ignore letter case, so two such names would silently become one file.
    const seen = new Set<string>();
    for (const f of files) {
      const folded = f.key.toLowerCase();
      if (seen.has(folded))
        throw new ReviewError(
          422,
          `Tên file chỉ khác nhau chữ hoa/thường: ${f.key.slice(key.length + 1)}`,
        );
      seen.add(folded);
    }
    await this.remote!.uploadFiles(files);
  }
  async readRemote(key: string) {
    try {
      return await this.remote!.read(key);
    } catch (e) {
      console.error('Remote storage read failed:', (e as Error).message);
      throw new ReviewError(
        502,
        'Không đọc được dữ liệu từ kho lưu trữ chung. Kiểm tra mạng và cấu hình Dropbox.',
      );
    }
  }
  remoteSource(key: string): AssetSource {
    return {
      remote: true,
      locate(image) {
        const relative = path.posix.normalize(image);
        if (relative.startsWith('../') || relative.startsWith('/') || image.includes('\\'))
          throw new Error('Frame image escapes dataset directory');
        return `${key}/${relative}`;
      },
      read: async (asset) => {
        const cached = this.assets.get(asset);
        if (cached) {
          // Re-insert so the map order keeps the most recently used frames last.
          this.assets.delete(asset);
          this.assets.set(asset, cached);
          return cached;
        }
        const data = await this.readRemote(asset);
        if (!data || data.length > ASSET_CACHE_BYTES) return data;
        this.assets.set(asset, data);
        this.assetBytes += data.length;
        for (const [oldest, bytes] of this.assets) {
          if (this.assetBytes <= ASSET_CACHE_BYTES) break;
          this.assets.delete(oldest);
          this.assetBytes -= bytes.length;
        }
        return data;
      },
    };
  }
  async load(row: ProjectRow, options: DatasetOptions) {
    if (row.demo_key && this.demos.has(row.demo_key))
      return loadDataset(this.demos.get(row.demo_key)!, options);
    if (!row.storage_key)
      return loadDataset(row.dataset_path, options).catch((e) => {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        throw new ReviewError(
          409,
          'Project này chỉ có dữ liệu trên máy đã import. Chạy npm run storage:push trên máy đó để chia sẻ.',
        );
      });
    if (!STORAGE_KEY.test(row.storage_key) || !row.storage_key.startsWith(`projects/${row.id}/`))
      throw new ReviewError(409, 'Storage key của project không hợp lệ.');
    if (!this.remote || row.storage_provider !== this.remote.name)
      throw new ReviewError(
        409,
        `Dữ liệu project nằm trên ${row.storage_provider}. Cấu hình SMARTREVIEW_REMOTE_STORAGE trong .env để đọc.`,
      );
    const text = await this.readRemote(`${row.storage_key}/dataset.json`);
    if (!text)
      throw new ReviewError(
        409,
        'Không tìm thấy dữ liệu project trên kho lưu trữ chung. Nếu project được chia sẻ ở dạng .tar cũ, chạy npm run storage:push trên máy còn giữ file.',
      );
    return buildDataset(text.toString('utf8'), options, this.remoteSource(row.storage_key));
  }
  // Moves a project whose files are still on this machine to the remote: imports made without
  // remote storage and projects shared earlier as a single .tar.
  async share(id: string) {
    const row = await this.row(id);
    if (!this.remote) throw new Error('Remote storage is not configured.');
    if (row.status !== 'READY' || row.demo_key) return false;
    const key: string =
      row.storage_key ??
      path
        .relative(this.storageRoot, path.dirname(row.dataset_path ?? ''))
        .split(path.sep)
        .join('/');
    if (!STORAGE_KEY.test(key) || !key.startsWith(`projects/${id}/`)) return false;
    try {
      await fs.access(path.join(this.storageRoot, key, 'dataset.json'));
    } catch {
      return false;
    }
    await this.publish(key);
    const local = path.join(this.storageRoot, 'projects', id);
    try {
      const ai = await fs.readFile(path.join(local, 'ai', 'latest.json'));
      await this.remote.write(`projects/${id}/ai/latest.json`, ai);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    await this.pool.execute<Rows>(
      'UPDATE projects SET storage_provider=?,storage_key=?,storage_synced_at=UTC_TIMESTAMP(3),dataset_path=NULL WHERE id=?',
      [this.remote.name, key, id],
    );
    await this.remote.remove(key + '.tar');
    await fs.rm(local, { recursive: true, force: true });
    this.cache.delete(id);
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
        const dataset = await this.load(row, {
          namespace: row.demo_key ? '' : id,
          apiPrefix: `/api/projects/${id}`,
          engineVersion: stored?.engine_version || LEGACY_ENGINE_VERSION,
          waivers: stored?.guideline_waivers,
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
    let published = false;
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
      // The guideline travels with the dataset. Only the choices a person made on its rules
      // reach the engine, as waivers; with none it applies its built-in policy.
      if (uploaded.guideline)
        data.dataset.metadata = {
          ...data.dataset.metadata,
          guideline: {
            file: path.relative(directory, uploaded.guideline.file).split(path.sep).join('/'),
            name: uploaded.guideline.name,
            ...(uploaded.rules && {
              rules: path.relative(directory, uploaded.rules).split(path.sep).join('/'),
            }),
          },
        };
      data = normalizeDataset(data);
      const datasetPath = path.join(directory, 'dataset.json');
      const json = JSON.stringify(data, null, 2);
      await fs.writeFile(datasetPath, json, { flag: 'wx' });
      await this.status(id, 'ANALYZING');
      const options = {
        namespace: id,
        apiPrefix: `/api/projects/${id}`,
        engineVersion: LATEST_ENGINE_VERSION,
        waivers: uploaded.rules
          ? waiversFrom(
              await fs
                .readFile(uploaded.rules, 'utf8')
                .then(JSON.parse)
                .catch(() => {
                  throw new ReviewError(422, 'File lựa chọn quy tắc không phải JSON hợp lệ.');
                }),
              checksFor(LATEST_ENGINE_VERSION).map((c) => c.id),
            )
          : {},
      };
      let dataset = await loadDataset(datasetPath, options);
      await fs.mkdir(path.join(directory, 'risk'));
      await fs.writeFile(
        path.join(directory, 'risk', 'report.json'),
        JSON.stringify(dataset.report, null, 2),
      );
      // With a remote, the upload directory is only a staging area: publish it, then serve from the remote.
      if (this.remote) {
        published = true;
        await this.publish(key);
        dataset = await buildDataset(json, options, this.remoteSource(key));
      }
      dataset.meta.project_name = row.name;
      const reviews = new ReviewStore(this.pool, dataset);
      await reviews.initialize();
      await this.pool.execute<Rows>(
        "UPDATE projects SET status='READY',dataset_path=?,dataset_revision_id=?,metadata=?,error_message=NULL,storage_provider=?,storage_key=?,storage_synced_at=? WHERE id=?",
        [
          this.remote ? null : datasetPath,
          reviews.datasetId,
          JSON.stringify(dataset.meta),
          this.remote?.name ?? 'local',
          this.remote ? key : null,
          this.remote ? new Date().toISOString().slice(0, 23).replace('T', ' ') : null,
          id,
        ],
      );
      this.cache.set(id, Promise.resolve({ dataset, reviews }));
      if (this.remote) {
        await fs.rm(directory, { recursive: true, force: true });
        await fs.rmdir(path.dirname(directory)).catch(() => {});
      }
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
      if (published)
        await this.remote!.remove(key).catch((error) =>
          console.error('Remote import cleanup pending:', key, (error as Error).message),
        );
      throw e;
    }
  }
}
