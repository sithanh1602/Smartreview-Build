import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ReviewError } from '../../shared/review.ts';
import { WAYMO_FORMAT, summarizeScene } from '../../shared/waymo.ts';
import { projectRoot } from '../config.ts';
import { receiveSegment } from './upload.ts';
import { buildSheets, placeShots } from './cameras.ts';
import { Review3DStore, boxKey } from './reviews.ts';
import type { BoxRef } from './reviews.ts';
import type { RemoteStorage } from '../storage/remote.ts';
import type { Untrusted } from '../../shared/review.ts';
import type { Scene3DSummary } from '../../shared/waymo.ts';
import type { Connection, Db, ProjectRole, Req, Result, Rows, User } from '../types.ts';

type ProjectRow = Rows[number];
// Everything a 3D project stores, on disk and on the remote, sits under this folder.
export const STORAGE_3D = 'Project3D';
export const SCENE_SCHEMA = '3d-1.0.0';
const EXPORT_TIMEOUT_MS = 20 * 60 * 1000;
// Files sent to the remote between two progress updates.
const PUBLISH_STEP = 16;
const STORAGE_KEY = /^Project3D\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/;
// Point clouds read from the remote stay in memory only. A frame is about 3 MB, so this holds
// the few dozen frames around where people are looking.
const FRAME_CACHE_BYTES = 128 * 1024 * 1024;
const PROJECT_VIEW = `SELECT p.*,u.username AS creator_name,
  (SELECT COUNT(*) FROM project_members_3d m WHERE m.project_id=p.id AND m.role='reviewer') AS reviewer_count,
  (SELECT COUNT(*) FROM project_members_3d m WHERE m.project_id=p.id AND m.role='annotator') AS annotator_count
  FROM projects_3d p LEFT JOIN users u ON u.id=p.created_by`;
const publicProject = ({
  dataset_path,
  dataset_revision_id,
  demo_key,
  storage_provider,
  storage_key,
  storage_synced_at,
  ...row
}: ProjectRow) => row;
const missing = () => new ReviewError(404, 'Project không tồn tại.');
export const noTable = (e: unknown) => (e as { code?: string }).code === 'ER_NO_SUCH_TABLE';

// How far the running import of a project is: frames converted, camera images written, their
// sheets made, then files sent to the remote.
export interface ImportProgress {
  step: 'export' | 'cameras' | 'sheets' | 'publish';
  done: number;
  total: number | null;
}
// The cuboids of a stored scene, by frame and by object, for checking what a review names.
interface SceneIndex {
  revision: number;
  fingerprint: string;
  segment: string;
  // Frame timestamp to its position in the scene and the objects boxed in it.
  frames: Map<number, { index: number; objects: Set<string> }>;
}
export interface Project3DOptions {
  python?: string;
  script?: string;
}
export class Project3DService {
  pool: Db;
  storageRoot: string;
  remote: RemoteStorage | null;
  python: string;
  script: string;
  deleting: Set<string>;
  progress: Map<string, ImportProgress>;
  files: Map<string, Buffer>;
  fileBytes: number;
  scenes: Map<string, Promise<SceneIndex>>;
  constructor(
    pool: Db,
    storageRoot: string,
    remote: RemoteStorage | null = null,
    options: Project3DOptions = {},
  ) {
    this.pool = pool;
    this.storageRoot = path.resolve(storageRoot);
    this.remote = remote;
    this.python =
      options.python ||
      process.env.SMARTREVIEW_3D_PYTHON ||
      path.join(projectRoot, '.venv/bin/python');
    this.script = options.script || fileURLToPath(new URL('./export_waymo.py', import.meta.url));
    this.deleting = new Set();
    this.progress = new Map();
    this.files = new Map();
    this.scenes = new Map();
    this.fileBytes = 0;
  }
  async recover() {
    try {
      await this.pool.query<Rows>(
        "UPDATE projects_3d SET status='FAILED',error_message='Import bị ngắt khi server dừng. Chọn lại files để thử lại.' WHERE status IN ('UPLOADING','VALIDATING','NORMALIZING','ANALYZING')",
      );
    } catch (e) {
      // Before migration 008 there are no 3D projects to recover.
      if (!noTable(e)) throw e;
    }
  }
  // What `user` is in the project; a project the user has no part in reads as missing.
  async role(id: string, user: User): Promise<ProjectRole> {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw missing();
    const [[row]] = await this.pool.execute<Rows>(
      'SELECT p.created_by,m.role FROM projects_3d p LEFT JOIN project_members_3d m ON m.project_id=p.id AND m.user_id=? WHERE p.id=?',
      [user.id, id],
    );
    if (!row) throw missing();
    if (user.role === 'leader') {
      if (row.created_by !== user.id) throw missing();
      return 'leader';
    }
    if (!row.role) throw missing();
    return row.role;
  }
  async row(id: string): Promise<ProjectRow> {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw missing();
    const [[row]] = await this.pool.execute<Rows>('SELECT * FROM projects_3d WHERE id=?', [id]);
    if (!row) throw missing();
    return row;
  }
  async get(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw missing();
    const [[row]] = await this.pool.execute<Rows>(PROJECT_VIEW + ' WHERE p.id=?', [id]);
    if (!row) throw missing();
    return {
      ...(publicProject(row) as ProjectRow),
      progress: this.progress.get(id) ?? null,
      // How much of a READY project has been reviewed.
      ...(row.status === 'READY' &&
        row.dataset_revision_id && {
          review_summary: await new Review3DStore(this.pool, row.dataset_revision_id).summary(),
        }),
    };
  }
  // A leader sees the 3D projects it created; a member sees the ones it was added to.
  async list(user: User) {
    const order = ' ORDER BY p.created_at DESC, p.id';
    const [rows] =
      user.role === 'leader'
        ? await this.pool.execute<Rows>(PROJECT_VIEW + ' WHERE p.created_by=?' + order, [user.id])
        : await this.pool.execute<Rows>(
            PROJECT_VIEW.replace('SELECT p.*', 'SELECT p.*,pm.role AS my_role') +
              ' JOIN project_members_3d pm ON pm.project_id=p.id AND pm.user_id=?' +
              order,
            [user.id],
          );
    return rows.map((row) =>
      publicProject(user.role === 'leader' ? { ...row, my_role: 'leader' } : row),
    );
  }
  async create(input: Untrusted, creator: User) {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some((k) => !['name', 'description'].includes(k))
    )
      throw new ReviewError(400, 'Invalid project fields.');
    const { name, description = '' } = input;
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.trim().length > 160 ||
      typeof description !== 'string' ||
      description.length > 2000
    )
      throw new ReviewError(400, 'Tên project 1–160 ký tự; mô tả tối đa 2000 ký tự.');
    const id = randomUUID();
    // The table's default provider is the remote; a project holds no files until its import.
    await this.pool.execute<Rows>(
      "INSERT INTO projects_3d(id,name,description,format,created_by,storage_provider) VALUES (?,?,?,?,?,'local')",
      [id, name.trim(), description, WAYMO_FORMAT, creator.id],
    );
    return this.get(id);
  }
  async status(id: string, status: string, error: string | null = null) {
    await this.pool.execute<Rows>('UPDATE projects_3d SET status=?,error_message=? WHERE id=?', [
      status,
      error,
      id,
    ]);
  }
  // Runs the exporter over the received parquet files: scene.json and frames/*.bin in `out`.
  async export(id: string, source: string, out: string) {
    try {
      await fs.access(this.python);
    } catch {
      throw new ReviewError(
        503,
        'Chưa có Python cho project 3D. Đặt SMARTREVIEW_3D_PYTHON trong .env tới một Python có numpy và pyarrow.',
      );
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.python, [this.script, source, '-o', out], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let errors = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), EXPORT_TIMEOUT_MS);
      // The exporter rewrites one line as it goes: "<n> frame", then "<n> image".
      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString(),
          images = text.match(/\d+(?= image)/g),
          frames = text.match(/\d+(?= frame)/g);
        if (images) this.progress.set(id, { step: 'cameras', done: +images.at(-1)!, total: null });
        else if (frames)
          this.progress.set(id, { step: 'export', done: +frames.at(-1)!, total: null });
      });
      child.stderr.on('data', (chunk: Buffer) => {
        errors = (errors + chunk.toString()).slice(-4000);
      });
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) return resolve();
        console.error('3D export failed:', errors.trim().slice(-1000));
        if (/No module named/.test(errors))
          return reject(
            new ReviewError(
              503,
              'Python của project 3D thiếu numpy hoặc pyarrow. Cài hai gói đó rồi thử lại.',
            ),
          );
        const reason = errors.trim().split('\n').pop() || 'exporter dừng bất thường';
        reject(new ReviewError(422, `Không chuyển được dữ liệu Waymo: ${reason.slice(0, 300)}`));
      });
    });
  }
  // Every file of an import directory goes to the remote under the same relative path.
  async publish(id: string, key: string) {
    const directory = path.join(this.storageRoot, key);
    const entries = await fs.readdir(directory, { recursive: true, withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => {
        const file = path.join(e.parentPath, e.name);
        return { file, key: `${key}/${path.relative(directory, file).split(path.sep).join('/')}` };
      });
    for (let done = 0; done < files.length; done += PUBLISH_STEP) {
      this.progress.set(id, { step: 'publish', done, total: files.length });
      await this.remote!.uploadFiles(files.slice(done, done + PUBLISH_STEP));
    }
  }
  async import(id: string, req: Req) {
    const row = await this.row(id);
    const [claimed] = await this.pool.execute<Result>(
      "UPDATE projects_3d SET status='UPLOADING',error_message=NULL WHERE id=? AND status IN ('CREATED','FAILED')",
      [id],
    );
    if (!claimed.affectedRows)
      throw new ReviewError(
        409,
        'Project đang import hoặc đã READY. Tạo project mới cho dataset khác.',
      );
    const key = `${STORAGE_3D}/${id}/${randomUUID()}`;
    const directory = path.join(this.storageRoot, key);
    // The parquet files are only the exporter's input; they are never published.
    const source = path.join(this.storageRoot, '.tmp', randomUUID());
    let published = false;
    try {
      const { components, shots } = await receiveSegment(req, source);
      await this.status(id, 'NORMALIZING');
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      await this.export(id, source, directory);
      const scenePath = path.join(directory, 'scene.json');
      let text = await fs.readFile(scenePath, 'utf8');
      let summary: Scene3DSummary, unmatchedImages: number;
      try {
        const scene = JSON.parse(text);
        summarizeScene(scene);
        // Camera images, from the exporter or sent loose, are listed in the scene and get
        // their sheets; the scene file is rewritten only when there are any.
        unmatchedImages = await placeShots(shots, directory, scene);
        if (
          await buildSheets(directory, scene, (done, total) =>
            this.progress.set(id, { step: 'sheets', done, total }),
          )
        ) {
          text = JSON.stringify(scene);
          await fs.writeFile(scenePath, text);
        }
        summary = summarizeScene(scene);
      } catch (e) {
        if (e instanceof ReviewError) throw e;
        throw new ReviewError(422, (e as Error).message);
      }
      await fs.rm(source, { recursive: true, force: true });
      const frames = await fs.readdir(path.join(directory, 'frames'));
      if (frames.length !== summary.total_frames)
        throw new ReviewError(422, 'Số tệp point cloud không khớp số frame của scene.');
      let bytes = 0;
      for (const entry of await fs.readdir(directory, { recursive: true, withFileTypes: true }))
        if (entry.isFile()) bytes += (await fs.stat(path.join(entry.parentPath, entry.name))).size;
      const fingerprint = createHash('sha256').update(id).update(text).digest('hex').slice(0, 20);
      const metadata = {
        ...summary,
        dataset_id: fingerprint,
        schema_version: SCENE_SCHEMA,
        motion_compensated: components.has('lidar_pose'),
        // Loose camera images whose name matched no frame; they were left out.
        unmatched_images: unmatchedImages,
        stored_bytes: bytes,
      };
      if (this.remote) {
        await this.status(id, 'ANALYZING');
        published = true;
        await this.publish(id, key);
      }
      // No 3D risk engine runs yet, so the revision records none.
      const [revision] = await this.pool.execute<Result>(
        "INSERT INTO dataset_revisions_3d(fingerprint,dataset_reference,name,schema_version,engine_version) VALUES (?,?,?,?,'none')",
        [fingerprint, summary.segment, row.name, SCENE_SCHEMA],
      );
      await this.pool.execute<Rows>(
        "UPDATE projects_3d SET status='READY',dataset_path=?,dataset_revision_id=?,metadata=?,error_message=NULL,storage_provider=?,storage_key=?,storage_synced_at=? WHERE id=?",
        [
          this.remote ? null : scenePath,
          revision.insertId,
          JSON.stringify(metadata),
          this.remote?.name ?? 'local',
          this.remote ? key : null,
          this.remote ? new Date().toISOString().slice(0, 23).replace('T', ' ') : null,
          id,
        ],
      );
      if (this.remote) await this.clear(id);
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
          console.error('Remote 3D import cleanup pending:', key, (error as Error).message),
        );
      throw e;
    } finally {
      this.progress.delete(id);
      await fs.rm(source, { recursive: true, force: true });
    }
  }
  // One stored file of a READY project (scene.json, frames/<timestamp>.bin), from wherever the
  // project lives; null when the file is not there.
  async read(id: string, relative: string): Promise<Buffer | null> {
    const row = await this.row(id);
    if (row.status !== 'READY')
      throw new ReviewError(409, 'Project chưa READY. Xem trạng thái import.');
    if (!row.storage_key) {
      if (!row.dataset_path) throw new ReviewError(409, 'Project chưa có dữ liệu.');
      try {
        return await fs.readFile(path.join(path.dirname(row.dataset_path), relative));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        if (relative !== 'scene.json') return null;
        throw new ReviewError(
          409,
          'Project này chỉ có dữ liệu trên máy đã import. Bật kho lưu trữ chung rồi tạo lại project để chia sẻ.',
        );
      }
    }
    if (!STORAGE_KEY.test(row.storage_key) || !row.storage_key.startsWith(`${STORAGE_3D}/${id}/`))
      throw new ReviewError(409, 'Storage key của project không hợp lệ.');
    if (!this.remote || row.storage_provider !== this.remote.name)
      throw new ReviewError(
        409,
        `Dữ liệu project nằm trên ${row.storage_provider}. Cấu hình SMARTREVIEW_REMOTE_STORAGE trong .env để đọc.`,
      );
    const key = `${row.storage_key}/${relative}`;
    const cached = this.files.get(key);
    if (cached) {
      // Re-insert so the map order keeps the most recently used files last.
      this.files.delete(key);
      this.files.set(key, cached);
      return cached;
    }
    let data: Buffer | null;
    try {
      data = await this.remote.read(key);
    } catch (e) {
      console.error('Remote storage read failed:', (e as Error).message);
      throw new ReviewError(
        502,
        'Không đọc được dữ liệu từ kho lưu trữ chung. Kiểm tra mạng và cấu hình Dropbox.',
      );
    }
    if (!data || data.length > FRAME_CACHE_BYTES) return data;
    this.files.set(key, data);
    this.fileBytes += data.length;
    for (const [oldest, bytes] of this.files) {
      if (this.fileBytes <= FRAME_CACHE_BYTES) break;
      this.files.delete(oldest);
      this.fileBytes -= bytes.length;
    }
    return data;
  }
  // The scene of a READY project as the review routes need it. A READY project never changes,
  // so the index is built once for each backend.
  index(id: string): Promise<SceneIndex> {
    let pending = this.scenes.get(id);
    if (!pending) {
      pending = (async () => {
        const data = await this.read(id, 'scene.json');
        if (!data) throw new ReviewError(409, 'Không tìm thấy dữ liệu project trên kho lưu trữ.');
        const row = await this.row(id);
        const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
        const scene = JSON.parse(data.toString('utf8'));
        const frames: SceneIndex['frames'] = new Map();
        scene.frames.forEach(
          (frame: { timestamp: number; boxes: { id: string }[] }, index: number) =>
            frames.set(frame.timestamp, { index, objects: new Set(frame.boxes.map((b) => b.id)) }),
        );
        return {
          revision: row.dataset_revision_id,
          fingerprint: meta.dataset_id,
          segment: scene.segment,
          frames,
        };
      })();
      this.scenes.set(id, pending);
      pending.catch(() => this.scenes.delete(id));
    }
    return pending;
  }
  async reviews(id: string) {
    const index = await this.index(id);
    return { index, store: new Review3DStore(this.pool, index.revision) };
  }
  // The cuboid of `objectId` in one frame, or in every frame it appears in when no frame is
  // given. Unknown frames and objects read as missing.
  boxes(index: SceneIndex, objectId: string, timestamp?: number): BoxRef[] {
    const refs: BoxRef[] = [];
    for (const [stamp, frame] of timestamp === undefined
      ? index.frames
      : [[timestamp, index.frames.get(timestamp)] as const])
      if (frame?.objects.has(objectId))
        refs.push({
          key: boxKey(stamp, objectId),
          timestamp: stamp,
          frameIndex: frame.index,
          segment: index.segment,
        });
    if (!refs.length) throw new ReviewError(404, 'Không có cuboid này trong scene.');
    return refs;
  }
  // Removes what this machine holds of a project.
  async clear(id: string) {
    await fs.rm(path.join(this.storageRoot, STORAGE_3D, id), { recursive: true, force: true });
  }
  async remove(id: string) {
    await this.row(id);
    if (this.deleting.has(id)) throw new ReviewError(409, 'Project đang được xóa.');
    this.deleting.add(id);
    let c: Connection | undefined;
    try {
      c = await this.pool.getConnection();
      await c.beginTransaction();
      const [[row]] = await c.execute<Rows>('SELECT * FROM projects_3d WHERE id=? FOR UPDATE', [
        id,
      ]);
      if (!row) throw missing();
      if (!['CREATED', 'FAILED', 'READY'].includes(row.status))
        throw new ReviewError(409, 'Chờ import hoàn tất trước khi xóa.');
      await c.execute<Rows>('DELETE FROM projects_3d WHERE id=?', [id]);
      if (row.dataset_revision_id) {
        const revision = row.dataset_revision_id;
        await c.execute<Rows>(
          'DELETE d FROM review_decisions_3d d JOIN risk_cases_3d r ON r.id=d.risk_case_id WHERE r.dataset_revision_id=?',
          [revision],
        );
        await c.execute<Rows>('DELETE FROM frame_reviews_3d WHERE dataset_revision_id=?', [
          revision,
        ]);
        await c.execute<Rows>('DELETE FROM risk_cases_3d WHERE dataset_revision_id=?', [revision]);
        await c.execute<Rows>('DELETE FROM dataset_revisions_3d WHERE id=?', [revision]);
      }
      await c.commit();
    } catch (e) {
      if (c) await c.rollback();
      throw e;
    } finally {
      c?.release();
      this.deleting.delete(id);
    }
    this.scenes.delete(id);
    // The rows are gone; files left behind by a failed cleanup belong to no project.
    let cleanupPending = false;
    try {
      await this.clear(id);
    } catch {
      cleanupPending = true;
      console.error('3D project cleanup pending:', id);
    }
    if (this.remote) {
      try {
        await this.remote.remove(`${STORAGE_3D}/${id}`);
      } catch (e) {
        cleanupPending = true;
        console.error('Remote 3D project cleanup pending:', id, (e as Error).message);
      }
    }
    return { deleted: true, cleanupPending };
  }
}
