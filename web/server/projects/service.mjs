import { AiService } from '../ai/service.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { importAnnotations, importers } from '../../core/importers/index.mjs';
import { normalizeDataset } from '../../core/schema/normalize.mjs';
import { loadDataset } from '../repository.mjs';
import { ReviewStore } from '../reviews/store.mjs';
import { ReviewError } from '../../shared/review.mjs';
import { receiveUpload, safePath } from './upload.mjs';
const publicProject = ({ dataset_path, dataset_revision_id, demo_key, ...row }) => row;
export class ProjectService {
  constructor(pool, storageRoot) {
    this.pool = pool;
    this.storageRoot = path.resolve(storageRoot);
    this.cache = new Map();
    this.deleting = new Set();
    this.ai = new AiService(this);
  }
  async recover() {
    await this.pool.query(
      "UPDATE projects SET status='FAILED',error_message='Import bị ngắt khi server dừng. Chọn lại files để thử lại.' WHERE status IN ('UPLOADING','VALIDATING','NORMALIZING','ANALYZING')",
    );
  }
  async row(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new ReviewError(404, 'Project không tồn tại.');
    const [[row]] = await this.pool.execute('SELECT * FROM projects WHERE id=?', [id]);
    if (!row) throw new ReviewError(404, 'Project không tồn tại.');
    return row;
  }
  async get(id) {
    return publicProject(await this.row(id));
  }
  async remove(id) {
    await this.row(id);
    if (this.deleting.has(id)) throw new ReviewError(409, 'Project đang được xóa.');
    this.deleting.add(id);
    let c, staged;
    const directory = path.join(this.storageRoot, 'projects', id);
    try {
      c = await this.pool.getConnection();
      await c.beginTransaction();
      const [[row]] = await c.execute('SELECT * FROM projects WHERE id=? FOR UPDATE', [id]);
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
        if (e.code !== 'ENOENT') throw e;
      }
      await c.execute('DELETE FROM projects WHERE id=?', [id]);
      if (row.dataset_revision_id) {
        const revision = row.dataset_revision_id;
        await c.execute(
          'DELETE d FROM review_decisions d JOIN risk_cases r ON r.id=d.risk_case_id WHERE r.dataset_revision_id=?',
          [revision],
        );
        await c.execute('DELETE FROM frame_reviews WHERE dataset_revision_id=?', [revision]);
        await c.execute('DELETE FROM risk_cases WHERE dataset_revision_id=?', [revision]);
        await c.execute('DELETE FROM dataset_revisions WHERE id=?', [revision]);
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
    return { deleted: true, cleanupPending };
  }
  async list() {
    const [rows] = await this.pool.query('SELECT * FROM projects ORDER BY created_at DESC, id');
    return rows.map(publicProject);
  }
  async create(input) {
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
    await this.pool.execute('INSERT INTO projects(id,name,description,format) VALUES (?,?,?,?)', [
      id,
      name.trim(),
      description,
      format,
    ]);
    return this.get(id);
  }
  async registerDemo(dataset, reviews, datasetPath) {
    const id = randomUUID();
    await this.pool.execute(
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
    const [[row]] = await this.pool.execute('SELECT id FROM projects WHERE dataset_revision_id=?', [
      reviews.datasetId,
    ]);
    return row.id;
  }
  async context(id) {
    const row = await this.row(id);
    if (row.status !== 'READY')
      throw new ReviewError(409, 'Project chưa READY. Xem trạng thái import.');
    if (!this.cache.has(id)) {
      const pending = (async () => {
        const dataset = await loadDataset(row.dataset_path, {
          namespace: row.demo_key ? '' : id,
          apiPrefix: `/api/projects/${id}`,
        });
        dataset.meta.project_name = row.name;
        const reviews = new ReviewStore(this.pool, dataset);
        // Persisted revision is the authority. Never silently replace it at read time.
        const [[revision]] = await this.pool.execute(
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
    return this.cache.get(id);
  }
  async status(id, status, error = null) {
    await this.pool.execute('UPDATE projects SET status=?,error_message=? WHERE id=?', [
      status,
      error,
      id,
    ]);
  }
  async import(id, req) {
    const row = await this.row(id);
    const [claimed] = await this.pool.execute(
      "UPDATE projects SET status='UPLOADING',error_message=NULL WHERE id=? AND status IN ('CREATED','FAILED')",
      [id],
    );
    if (!claimed.affectedRows)
      throw new ReviewError(
        409,
        'Project đang import hoặc đã READY. Tạo project mới cho dataset khác.',
      );
    const directory = path.join(this.storageRoot, 'projects', id, randomUUID());
    try {
      const uploaded = await receiveUpload(req, directory, row.format);
      await this.status(id, 'VALIDATING');
      const text = await fs.readFile(uploaded.annotation, 'utf8');
      let data;
      try {
        data = importAnnotations(row.format, text, { id, name: row.name });
      } catch (e) {
        throw new ReviewError(422, e.message.slice(0, 1000));
      }
      if (data.annotations.length > 100000 || data.frames.length > 10000)
        throw new ReviewError(422, 'MVP hỗ trợ tối đa 100000 annotations và 10000 frames.');
      await this.status(id, 'NORMALIZING');
      const used = new Set();
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
        const actual = uploaded.dimensions.get(key),
          declared = mediaById.get(f.media_id);
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
      });
      dataset.meta.project_name = row.name;
      await fs.mkdir(path.join(directory, 'risk'));
      await fs.writeFile(
        path.join(directory, 'risk', 'report.json'),
        JSON.stringify(dataset.report, null, 2),
      );
      const reviews = new ReviewStore(this.pool, dataset);
      await reviews.initialize();
      await this.pool.execute(
        "UPDATE projects SET status='READY',dataset_path=?,dataset_revision_id=?,metadata=?,error_message=NULL WHERE id=?",
        [datasetPath, reviews.datasetId, JSON.stringify(dataset.meta), id],
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
