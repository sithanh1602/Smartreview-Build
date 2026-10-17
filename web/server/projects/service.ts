import { AiService } from '../ai/service.ts';
import { rescoreDataset } from '../ai/rescore.ts';
import { VerifyService } from '../verify/service.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { imageResolver, importDataset, isFormat, namesImages } from '../../core/importers/index.ts';
import { applyEnvRisk, parseImageTable } from '../../core/importers/signals.ts';
import { normalizeDataset } from '../../core/schema/normalize.ts';
import {
  LEGACY_ENGINE_VERSION,
  LATEST_ENGINE_VERSION,
  checkPatches,
  checksFor,
} from '../../core/risk/engine.ts';
import { mergeLabels } from '../../core/risk/policy.ts';
import { waiversFrom } from '../../shared/guideline-waivers.ts';
import { patchesFrom, summaryFrom } from '../../shared/guideline-rules.ts';
import { buildDataset, loadDataset } from '../repository.ts';
import { ReviewStore } from '../reviews/store.ts';
import { ReviewError } from '../../shared/review.ts';
import { receiveUpload, safePath } from './upload.ts';
import { ProjectMembers } from './members.ts';
import { ProjectHandoffs, compareReturn, sameShape } from './handoff.ts';
import type { HandoffResult } from './handoff.ts';
import { returnedDataset } from './return.ts';
import { FrameReviewStore } from '../frames/store.ts';
import type { SourceFile } from '../../core/importers/index.ts';
import type { RemoteStorage } from '../storage/remote.ts';
import type { AssetSource, DatasetOptions } from '../repository.ts';
import type { Untrusted } from '../../shared/review.ts';
import type { Dataset } from '../../core/schema/types.ts';
import type {
  Connection,
  Db,
  LoadedDataset,
  ProjectContext,
  ProjectRole,
  Req,
  Result,
  Rows,
  User,
} from '../types.ts';

type ProjectRow = Rows[number];
// How far the second half of an import is: files sent to the remote, then risk cases saved.
export interface ImportProgress {
  step: 'score' | 'publish' | 'save';
  done: number;
  total: number;
}
// Files sent to the remote between two progress updates; what was sent is not sent again when
// an interrupted import is resumed.
const PUBLISH_STEP = 20;
const INTERRUPTED =
  'Tải lên kho lưu trữ hoặc lưu vào MySQL bị gián đoạn. Bấm "Thử lại" để làm tiếp từ chỗ dở.';
const STORAGE_KEY = /^projects\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/;
// Frames fetched from the remote stay in memory only; nothing is written to disk.
const ASSET_CACHE_BYTES = 64 * 1024 * 1024;
// A project as the API shows it: with who created it and how many people hold each role.
const PROJECT_VIEW = `SELECT p.*,u.username AS creator_name,
  (SELECT COUNT(*) FROM project_members m WHERE m.project_id=p.id AND m.role='reviewer') AS reviewer_count,
  (SELECT COUNT(*) FROM project_members m WHERE m.project_id=p.id AND m.role='annotator') AS annotator_count
  FROM projects p LEFT JOIN users u ON u.id=p.created_by`;
const publicProject = ({
  dataset_path,
  dataset_revision_id,
  demo_key,
  storage_provider,
  storage_key,
  storage_synced_at,
  ...row
}: ProjectRow): ProjectRow => ({ ...row, hidden: Boolean(row.hidden) });
export class ProjectService {
  pool: Db;
  storageRoot: string;
  cache: Map<string, Promise<ProjectContext>>;
  deleting: Set<string>;
  ai: AiService;
  verify: VerifyService;
  members: ProjectMembers;
  handoffs: ProjectHandoffs;
  remote: RemoteStorage | null;
  demos: Map<string, string>;
  assets: Map<string, Buffer>;
  assetBytes: number;
  // Whether an import answers as soon as the dataset is staged and checked, leaving the upload
  // to the remote and the writes to MySQL to run after the response. The server turns it on.
  background: boolean;
  progress: Map<string, ImportProgress>;
  finishing: Set<string>;
  // Staging directories of imports already on the remote, kept until the label scan chosen at
  // upload has read their frames, so the scan does not fetch them back.
  kept: Map<string, string>;
  constructor(pool: Db, storageRoot: string, remote: RemoteStorage | null = null) {
    this.pool = pool;
    this.storageRoot = path.resolve(storageRoot);
    this.remote = remote;
    this.cache = new Map();
    this.deleting = new Set();
    this.demos = new Map();
    this.assets = new Map();
    this.assetBytes = 0;
    this.background = false;
    this.progress = new Map();
    this.finishing = new Set();
    this.kept = new Map();
    this.ai = new AiService(this);
    this.verify = new VerifyService(this);
    this.members = new ProjectMembers(pool);
    this.handoffs = new ProjectHandoffs(pool);
  }
  async recover() {
    await this.pool.query<Rows>(
      "UPDATE projects SET status='FAILED',error_message='Import bị ngắt khi server dừng. Thử lại, hoặc chọn lại files.' WHERE status IN ('UPLOADING','VALIDATING','NORMALIZING','ANALYZING')",
    );
  }
  async row(id: string): Promise<ProjectRow> {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new ReviewError(404, 'Project không tồn tại.');
    const [[row]] = await this.pool.execute<Rows>('SELECT * FROM projects WHERE id=?', [id]);
    if (!row) throw new ReviewError(404, 'Project không tồn tại.');
    return row;
  }
  async get(id: string) {
    await this.row(id);
    const [[row]] = await this.pool.execute<Rows>(PROJECT_VIEW + ' WHERE p.id=?', [id]);
    if (!row) throw new ReviewError(404, 'Project không tồn tại.');
    return {
      ...(publicProject(row) as ProjectRow),
      // Present while this backend is finishing the import.
      progress: this.progress.get(id) ?? null,
      // A failed import whose checked files are still on this machine can be finished.
      can_resume: row.status === 'FAILED' && !!(await this.staged(id)),
    } as ProjectRow;
  }
  // The key of the import waiting on this machine to be finished: its files were received and
  // checked, and the dataset and risk report written.
  async staged(id: string) {
    const root = path.join(this.storageRoot, 'projects', id);
    for (const name of await fs.readdir(root).catch(() => [] as string[])) {
      const key = `projects/${id}/${name}`;
      if (!STORAGE_KEY.test(key)) continue;
      try {
        await fs.access(path.join(root, name, 'risk', 'report.json'));
        return key;
      } catch {
        /* Not a finished staging directory. */
      }
    }
    return null;
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
      if (
        !['CREATED', 'FAILED', 'READY'].includes(row.status) ||
        this.ai.active ||
        this.verify.active
      )
        throw new ReviewError(409, 'Chờ import, AI Check hoặc kiểm nhãn hoàn tất trước khi xóa.');
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
  // The creator hides the project from other leaders, or shows it again. Members who joined
  // keep their access either way.
  async setHidden(id: string, input: Untrusted, user: User) {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some((k) => k !== 'hidden') ||
      typeof input.hidden !== 'boolean'
    )
      throw new ReviewError(400, 'Gửi { hidden: true } hoặc { hidden: false }.');
    const [result] = await this.pool.execute<Result>(
      'UPDATE projects SET hidden=? WHERE id=? AND created_by=?',
      [input.hidden, id, user.id],
    );
    if (!result.affectedRows)
      throw new ReviewError(403, 'Chỉ Leader tạo project được ẩn hoặc hiện project này.');
    return { id, hidden: input.hidden };
  }
  // Without a user: every project (scripts). A leader sees its own projects and those other
  // leaders did not hide; a member sees the projects it joined. `my_role` is the user's role there.
  async list(user?: User) {
    const order = ' ORDER BY p.created_at DESC, p.id';
    const [rows] = !user
      ? await this.pool.query<Rows>(PROJECT_VIEW + order)
      : user.role === 'leader'
        ? await this.pool.execute<Rows>(
            PROJECT_VIEW + ' WHERE p.hidden=0 OR p.created_by=?' + order,
            [user.id],
          )
        : await this.pool.execute<Rows>(
            PROJECT_VIEW.replace('SELECT p.*', 'SELECT p.*,pm.role AS my_role') +
              ' JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=?' +
              order,
            [user.id],
          );
    return rows.map((row) =>
      publicProject(user?.role === 'leader' ? { ...row, my_role: 'leader' } : row),
    );
  }
  async create(input: Untrusted, creator?: User) {
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
    if (!isFormat(format)) throw new ReviewError(400, 'Format chưa được hỗ trợ.');
    const id = randomUUID();
    await this.pool.execute<Rows>(
      'INSERT INTO projects(id,name,description,format,created_by) VALUES (?,?,?,?,?)',
      [id, name.trim(), description, format, creator?.id ?? null],
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
  // Files go in steps; a note beside the directory counts those already there, so a resumed
  // import sends only the rest.
  async publish(key: string, id?: string) {
    const directory = path.join(this.storageRoot, key);
    const entries = await fs.readdir(directory, { recursive: true, withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => {
        const file = path.join(e.parentPath, e.name);
        const relative = path.relative(directory, file).split(path.sep).join('/');
        return { file, key: `${key}/${relative}` };
      })
      .sort((a, b) => (a.key < b.key ? -1 : 1));
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
    const note = directory + '.published';
    let done = Math.min(Number(await fs.readFile(note, 'utf8').catch(() => 0)) || 0, files.length);
    while (done < files.length) {
      if (id) this.progress.set(id, { step: 'publish', done, total: files.length });
      await this.remote!.uploadFiles(files.slice(done, done + PUBLISH_STEP));
      done = Math.min(done + PUBLISH_STEP, files.length);
      await fs.writeFile(note, String(done));
    }
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
    for (const report of ['ai', 'verify'])
      try {
        const latest = await fs.readFile(path.join(local, report, 'latest.json'));
        await this.remote.write(`projects/${id}/${report}/latest.json`, latest);
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
  // The annotator returns the dataset after fixing it: the same images with new annotations,
  // in any format the importer reads. The project switches to it as a new revision, decisions
  // on labels that did not change are kept, and the reviewers get a list of what became of
  // every error they sent.
  async returnFixed(id: string, files: SourceFile[], user: User, role: ProjectRole) {
    const report = await this.handoffs.sent(id, user, role);
    const row = await this.row(id);
    const { dataset: old, reviews: oldReviews } = await this.context(id);
    if (row.demo_key) throw new ReviewError(409, 'Dataset demo không nhận bản sửa.');
    const { data, frames } = returnedDataset(old.normalized, files, { id, name: row.name });
    const json = JSON.stringify(data, null, 2);
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
    const options = {
      namespace: id,
      apiPrefix: `/api/projects/${id}`,
      engineVersion: meta?.engine_version || LEGACY_ENGINE_VERSION,
      waivers: meta?.guideline_waivers,
      patches: meta?.guideline_patches,
      guideline: meta?.guideline,
    };
    const remoteKey: string | null = row.storage_key;
    const source: AssetSource = remoteKey
      ? this.remoteSource(remoteKey)
      : {
          remote: false,
          locate: (image) => path.join(path.dirname(row.dataset_path), image),
          read: (asset) => fs.readFile(asset),
        };
    const dataset = await buildDataset(json, options, source);
    if (dataset.meta.dataset_id === old.meta.dataset_id)
      throw new ReviewError(422, 'File không có thay đổi nào so với bản đã gửi.');
    // The sent dataset is kept beside the new one; the project reads dataset.json.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (remoteKey) {
      const before = await this.readRemote(`${remoteKey}/dataset.json`);
      if (before)
        await this.remote!.write(`${remoteKey}/dataset.sent-${stamp}.json`, new Uint8Array(before));
      await this.remote!.write(`${remoteKey}/dataset.json`, Buffer.from(json));
    } else {
      await fs.copyFile(
        row.dataset_path,
        path.join(path.dirname(row.dataset_path), `dataset.sent-${stamp}.json`),
      );
      await fs.writeFile(row.dataset_path, json);
    }
    dataset.meta.project_name = row.name;
    const reviews = new ReviewStore(this.pool, dataset);
    await reviews.initialize();
    await this.pool.execute<Rows>(
      'UPDATE projects SET dataset_revision_id=?,metadata=? WHERE id=?',
      [reviews.datasetId, JSON.stringify(dataset.meta), id],
    );
    this.cache.set(id, Promise.resolve({ dataset, reviews }));
    // Decisions follow labels that are exactly as they were; everything else is reviewed anew.
    const decisions = await oldReviews.list();
    const byFrame = new Map<string, typeof dataset.allCases>();
    for (const c of dataset.allCases)
      byFrame.set(c.frame_ref, [...(byFrame.get(c.frame_ref) ?? []), c]);
    const taken = new Set<string>();
    for (const before of old.allCases) {
      const decision = decisions[before.id];
      if (!decision) continue;
      const same = (byFrame.get(frames.get(before.frame_ref)!) ?? []).find(
        (c) =>
          !taken.has(c.id) &&
          c.class_name === before.class_name &&
          sameShape(c.geometry, before.geometry),
      );
      if (!same) continue;
      taken.add(same.id);
      await reviews.save(same, decision, 'create');
    }
    const result = compareReturn(
      report,
      { dataset_revision: dataset.meta.dataset_id, annotations: dataset.normalized.annotations },
      frames,
      (frame) =>
        dataset.assets.has(frame)
          ? `/api/projects/${id}/assets/${encodeURIComponent(frame)}?dataset=${dataset.meta.dataset_id}`
          : null,
    );
    // Regions marked as missing stay on the image until a label covers them.
    const added = new Set(result.missing.filter((m) => m.outcome === 'added').map((m) => m.id));
    const frameReviews = await new FrameReviewStore(this.pool, oldReviews.datasetId).list();
    const next = new FrameReviewStore(this.pool, reviews.datasetId);
    for (const [frame, review] of Object.entries(frameReviews)) {
      const target = frames.get(frame);
      if (!target) continue;
      const regions = review.missing_regions.filter((r) => !added.has(`${frame}:${r.id}`));
      await next.save(target, {
        status: regions.length === review.missing_regions.length ? review.status : 'IN_PROGRESS',
        missing_regions: regions,
        note: review.note,
        version: 0,
      });
    }
    await this.handoffs.returned(id, user, result);
    return result;
  }
  // A reviewer's answer to one item of a returned round. Accept saves the label there now as
  // Correct. Reject marks the item again for the next round: the label there now becomes an
  // Error as it was sent, or, with no label there (removed, never drawn), the region is marked
  // as missing on its image. Answering again replaces the first answer.
  async judge(id: string, input: Untrusted, user: User, role: ProjectRole) {
    if (role === 'annotator')
      throw new ReviewError(403, 'Chỉ Leader hoặc Reviewer được kiểm tra bản sửa.');
    const value = input?.verdict,
      itemId = input?.item_id,
      note = input?.note ?? null;
    if (value !== 'accept' && value !== 'reject')
      throw new ReviewError(400, 'verdict phải là accept hoặc reject.');
    if (typeof itemId !== 'string') throw new ReviewError(400, 'Thiếu item_id.');
    if (note !== null && (typeof note !== 'string' || note.length > 1000))
      throw new ReviewError(400, 'Ghi chú tối đa 1000 ký tự.');
    const result = await this.handoffs.returnedResult(id);
    const found = (
      [
        ['error', result.errors],
        ['missing', result.missing],
        ['review', result.review ?? []],
      ] as const
    ).flatMap(([kind, list]) =>
      list.filter((i) => i.id === itemId).map((item) => ({ kind, item })),
    )[0];
    if (!found) throw new ReviewError(404, 'Không tìm thấy mục này trong bản sửa.');
    const { kind, item } = found;
    const text = note?.trim() || null;
    const { dataset, reviews } = await this.context(id);
    if (item.now) {
      const label = dataset.allCases.find((c) => c.id === item.now!.id);
      if (!label) throw new ReviewError(409, 'Nhãn hiện tại không còn trong dataset.');
      const existing = (await reviews.list())[label.id];
      const sent = kind === 'error' ? (item as HandoffResult['errors'][number]) : null;
      await reviews.save(
        label,
        {
          ...(value === 'accept'
            ? { decision: 'CORRECT', error_type: null, corrected_value: null, note: text }
            : {
                decision: 'ERROR',
                error_type: sent?.error_type ?? 'OTHER',
                corrected_value: sent?.corrected_value ?? null,
                note: text ?? item.note ?? null,
              }),
          version: existing?.version,
        },
        existing ? 'update' : 'create',
        user.id,
      );
    } else {
      // The region of an item without a label, kept under an id of its own so a second
      // answer replaces it.
      const regionId = 'recheck-' + createHash('sha256').update(item.id).digest('hex').slice(0, 16);
      const frames = new FrameReviewStore(this.pool, reviews.datasetId);
      const current = await frames.read(item.frame_ref);
      const others = (current?.missing_regions ?? []).filter((r) => r.id !== regionId);
      const g = item.geometry;
      const box =
        g.type === 'bbox'
          ? g
          : g.type === 'polygon' || g.type === 'polyline'
            ? (() => {
                const xs = g.points.map((p) => p[0]),
                  ys = g.points.map((p) => p[1]);
                const x = Math.min(...xs),
                  y = Math.min(...ys);
                return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
              })()
            : null;
      if (value === 'reject' && !box)
        throw new ReviewError(422, 'Mục này không có khung để đánh dấu lại.');
      const regions =
        value === 'reject'
          ? [
              ...others,
              {
                id: regionId,
                label:
                  (kind === 'error' && (item as HandoffResult['errors'][number]).corrected_value) ||
                  item.class_name ||
                  'object',
                note: text ?? item.note ?? 'Reviewer từ chối bản sửa.',
                geometry: {
                  type: 'bbox' as const,
                  x: box!.x,
                  y: box!.y,
                  width: box!.width,
                  height: box!.height,
                },
              },
            ]
          : others;
      if (current || regions.length)
        await frames.save(item.frame_ref, {
          status: current?.status ?? 'IN_PROGRESS',
          missing_regions: regions,
          note: current?.note ?? '',
          version: current?.version ?? 0,
        });
    }
    item.verdict = { value, note: text, by: user.username, at: new Date().toISOString() };
    await this.handoffs.saveResult(id, result);
    return result;
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
          patches: stored?.guideline_patches,
          guideline: stored?.guideline,
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
        // What the label scan of this dataset found belongs in the review queue; a scan that
        // cannot be read must not keep the project from opening.
        await this.verify
          .apply(id, { dataset, reviews })
          .catch((e) => console.error('Label scan not applied:', id, (e as Error).message));
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
  async import(
    id: string,
    req: Req,
    { rescore = false, rescoreModel }: { rescore?: boolean; rescoreModel?: string } = {},
  ) {
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
    // New files replace what an interrupted import left here and on the remote.
    const left = await this.staged(id);
    await fs.rm(path.join(this.storageRoot, 'projects', id), { recursive: true, force: true });
    if (left && this.remote)
      void this.remote
        .remove(left)
        .catch((error) =>
          console.error('Remote import cleanup pending:', left, (error as Error).message),
        );
    const key = `projects/${id}/${randomUUID()}`;
    const directory = path.join(this.storageRoot, key);
    try {
      const uploaded = await receiveUpload(req, directory, row.format);
      await this.status(id, 'VALIDATING');
      const sources = await Promise.all(
        [...uploaded.annotations].map(async ([name, file]) => ({
          name,
          text: await fs.readFile(file, 'utf8'),
        })),
      );
      // One way of matching a frame to an uploaded image, used for sizes and for linking.
      const findImage = imageResolver(uploaded.media.keys());
      let data: Dataset;
      try {
        data = importDataset(row.format, sources, {
          id,
          name: row.name,
          sizes: (image) => uploaded.dimensions.get(findImage(image) ?? ''),
        });
        if (uploaded.metadata)
          applyEnvRisk(data, parseImageTable(await fs.readFile(uploaded.metadata, 'utf8')));
      } catch (e) {
        throw new ReviewError(422, (e as Error).message.slice(0, 1000));
      }
      if (data.annotations.length > 100000 || data.frames.length > 10000)
        throw new ReviewError(422, 'MVP hỗ trợ tối đa 100000 annotations và 10000 frames.');
      await this.status(id, 'NORMALIZING');
      const used = new Set<string>();
      const images = new Map<string, string>();
      const mediaById = new Map(data.media.map((m) => [m.id, m]));
      for (const f of data.frames) {
        if (!f.image) throw new ReviewError(422, `Frame ${f.id} thiếu image reference.`);
        const ref = safePath(namesImages(row.format) ? f.image.slice('images/'.length) : f.image);
        // Exact relative path first; a unique basename allows selecting a flat set of files.
        const key = findImage(ref);
        if (!key) throw new ReviewError(422, `Thiếu ảnh hoặc tên ảnh không duy nhất: ${ref}`);
        const actual = uploaded.dimensions.get(key)!,
          declared = mediaById.get(f.media_id)!;
        if (actual.width !== declared.width || actual.height !== declared.height)
          throw new ReviewError(
            422,
            `Kích thước ảnh ${ref} không khớp annotation (${actual.width}×${actual.height} thực tế).`,
          );
        used.add(key);
        images.set(f.id, uploaded.media.get(key)!);
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
      // Scored before labels are merged, so the model reads the names the annotators used.
      if (rescore) {
        try {
          await rescoreDataset(
            data,
            images,
            directory,
            (done, total) => this.progress.set(id, { step: 'score', done, total }),
            rescoreModel,
          );
        } finally {
          this.progress.delete(id);
        }
      }
      // Labels the policy merged (motorcycle, bicycle) are stored under their one name.
      data = mergeLabels(normalizeDataset(data));
      const datasetPath = path.join(directory, 'dataset.json');
      const json = JSON.stringify(data, null, 2);
      await fs.writeFile(datasetPath, json, { flag: 'wx' });
      await this.status(id, 'ANALYZING');
      const options = await this.importOptions(id, uploaded.rules, uploaded.guideline?.name);
      const dataset = await loadDataset(datasetPath, options);
      await fs.mkdir(path.join(directory, 'risk'));
      await fs.writeFile(
        path.join(directory, 'risk', 'report.json'),
        JSON.stringify(dataset.report, null, 2),
      );
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
    // The dataset is received and checked. What is left talks to the remote and to MySQL, which
    // can take minutes: in the background it runs after the response.
    if (this.background) void this.finish(id, key).catch(() => {});
    else await this.finish(id, key);
    return this.get(id);
  }
  // Removes the staging directory kept for a label scan (see `kept`), once nothing needs it.
  async release(id: string) {
    const directory = this.kept.get(id);
    if (!directory) return;
    this.kept.delete(id);
    await fs.rm(directory, { recursive: true, force: true });
    await fs.rm(directory + '.published', { force: true });
    await fs.rmdir(path.dirname(directory)).catch(() => {});
  }
  // Finishes the import of a FAILED project whose checked files are still on this machine.
  async resume(id: string) {
    const key = await this.staged(id);
    if (!key)
      throw new ReviewError(409, 'Không còn dữ liệu chờ trên máy này. Chọn lại file để import.');
    const [claimed] = await this.pool.execute<Result>(
      "UPDATE projects SET status='ANALYZING',error_message=NULL WHERE id=? AND status='FAILED'",
      [id],
    );
    if (!claimed.affectedRows || this.finishing.has(id))
      throw new ReviewError(409, 'Project đang import hoặc đã READY.');
    if (this.background) void this.finish(id, key).catch(() => {});
    else await this.finish(id, key);
    return this.get(id);
  }
  // The second half of an import: the staged directory goes to the remote, the risk cases to
  // MySQL, and the project becomes READY. A failure keeps the directory, so `resume` continues.
  async finish(id: string, key: string) {
    const directory = path.join(this.storageRoot, key);
    this.finishing.add(id);
    try {
      const row = await this.row(id);
      const datasetPath = path.join(directory, 'dataset.json');
      const json = await fs.readFile(datasetPath, 'utf8');
      const guideline = JSON.parse(json).dataset?.metadata?.guideline;
      const rules: string | undefined = guideline?.rules;
      const options = await this.importOptions(
        id,
        rules && path.join(directory, rules),
        guideline?.name,
      );
      let dataset: LoadedDataset;
      // With a remote, the upload directory is only a staging area: publish it, then serve from the remote.
      if (this.remote) {
        await this.publish(key, id);
        dataset = await buildDataset(json, options, this.remoteSource(key));
      } else dataset = await loadDataset(datasetPath, options);
      dataset.meta.project_name = row.name;
      const reviews = new ReviewStore(this.pool, dataset);
      await reviews.initialize((done, total) =>
        this.progress.set(id, { step: 'save', done, total }),
      );
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
      if (this.remote) this.kept.set(id, directory);
      // A label scan chosen in the upload popup was waiting for this.
      void this.verify.drain();
      if (this.remote && !this.verify.waiting(id)) await this.release(id);
    } catch (e) {
      console.error('Import not finished:', id, (e as Error).message);
      await this.status(id, 'FAILED', e instanceof ReviewError ? e.message : INTERRUPTED).catch(
        () => {},
      );
      throw e;
    } finally {
      this.finishing.delete(id);
      this.progress.delete(id);
    }
  }
  // What the risk engine is run with for an imported project; `rules` is the file holding the
  // choices a person made on the guideline's rules.
  async importOptions(id: string, rules?: string | null, name?: string) {
    const base = {
      namespace: id,
      apiPrefix: `/api/projects/${id}`,
      engineVersion: LATEST_ENGINE_VERSION,
    };
    if (!rules) return { ...base, waivers: {} };
    const file = await fs
      .readFile(rules, 'utf8')
      .then(JSON.parse)
      .catch(() => {
        throw new ReviewError(422, 'File lựa chọn quy tắc không phải JSON hợp lệ.');
      });
    const patches = patchesFrom(file);
    try {
      checkPatches(patches);
    } catch (e) {
      throw new ReviewError(
        422,
        `Quy tắc guideline không chạy được: ${(e as Error).message}`.slice(0, 500),
      );
    }
    return {
      ...base,
      waivers: waiversFrom(
        file,
        checksFor(LATEST_ENGINE_VERSION).map((c) => c.id),
      ),
      patches,
      guideline: summaryFrom(file, name),
    };
  }
}
