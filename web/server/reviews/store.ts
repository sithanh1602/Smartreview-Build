import { createHash } from 'node:crypto';
import { ReviewError } from '../../shared/review.ts';
import type { ReviewInput, ReviewMode } from '../../shared/review.ts';
import type { Case, Connection, Db, LoadedDataset, Rows } from '../types.ts';

export interface Metrics {
  total_risk_cases: number;
  high: number;
  medium: number;
  reviewed: number;
  confirmed_errors: number;
  correct: number;
  unsure: number;
  unreviewed: number;
  review_progress: number;
  dataset_revision: string;
}
export interface Review {
  decision: string;
  error_type: string | null;
  corrected_value: string | null;
  note: string | null;
  version: number;
  reviewed_at: string;
}
const key = (id: string) => createHash('sha256').update(id).digest('hex');
const fields = 'd.decision,d.error_type,d.corrected_value,d.note,d.version,d.reviewed_at';
// Rows carry exactly the review columns selected by `fields`.
const serialize = (row: Rows[number]) =>
  ({ ...row, reviewed_at: row.reviewed_at.replace(' ', 'T') + 'Z' }) as unknown as Review;

export class ReviewStore {
  pool: Db;
  dataset: LoadedDataset;
  datasetId: number | null;
  suspicious: Set<string>;
  constructor(pool: Db, dataset: LoadedDataset) {
    this.pool = pool;
    this.dataset = dataset;
    this.datasetId = null;
    this.suspicious = new Set(dataset.cases.map((c) => c.id));
  }
  async initialize() {
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      const m = this.dataset.meta;
      await c.execute<Rows>(
        'INSERT INTO dataset_revisions(fingerprint,dataset_reference,name,schema_version,engine_version) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',
        [m.dataset_id, m.dataset_reference, m.name, m.schema_version, m.engine_version],
      );
      const [[row]] = await c.execute<Rows>(
        'SELECT id FROM dataset_revisions WHERE fingerprint=?',
        [m.dataset_id],
      );
      this.datasetId = row.id;
      for (const item of this.dataset.cases) await this.ensureCase(c, item);
      await c.commit();
    } catch (error) {
      await c.rollback();
      throw error;
    } finally {
      c.release();
    }
  }
  async ensureCase(c: Connection, item: Case): Promise<number> {
    await c.execute<Rows>(
      'INSERT INTO risk_cases(dataset_revision_id,annotation_key,annotation_reference,media_reference,frame_reference,frame_index,score,severity,is_suspicious,check_ids) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',
      [
        this.datasetId,
        key(item.id),
        item.id,
        item.reference.media_id,
        item.reference.frame_id,
        item.reference.frame_index,
        item.score,
        item.severity,
        this.suspicious.has(item.id) ? 1 : 0,
        JSON.stringify(item.check_ids),
      ],
    );
    const [[row]] = await c.execute<Rows>(
      'SELECT id FROM risk_cases WHERE dataset_revision_id=? AND annotation_key=?',
      [this.datasetId, key(item.id)],
    );
    return row.id;
  }
  async list(): Promise<Record<string, Review>> {
    const [rows] = await this.pool.execute<Rows>(
      `SELECT c.annotation_reference,${fields} FROM review_decisions d JOIN risk_cases c ON c.id=d.risk_case_id WHERE c.dataset_revision_id=?`,
      [this.datasetId],
    );
    return Object.fromEntries(
      rows.map(({ annotation_reference, ...r }) => [annotation_reference, serialize(r)]),
    );
  }
  async read(id: string) {
    const [rows] = await this.pool.execute<Rows>(
      `SELECT ${fields} FROM review_decisions d JOIN risk_cases c ON c.id=d.risk_case_id WHERE c.dataset_revision_id=? AND c.annotation_key=?`,
      [this.datasetId, key(id)],
    );
    return rows[0] ? serialize(rows[0]) : null;
  }
  async save(item: Case, input: ReviewInput, mode: ReviewMode, reviewerId: string | null = null) {
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      const id = await this.ensureCase(c, item);
      const [rows] = await c.execute<Rows>(
        'SELECT version FROM review_decisions WHERE risk_case_id=? FOR UPDATE',
        [id],
      );
      if (mode === 'create' && rows.length)
        throw new ReviewError(409, 'Review đã tồn tại. Tải lại quyết định rồi chỉnh sửa.');
      if (mode === 'update' && !rows.length) throw new ReviewError(404, 'Review chưa tồn tại.');
      if (mode === 'update' && rows[0].version !== input.version)
        throw new ReviewError(409, 'Review đã được chỉnh sửa ở nơi khác. Tải lại quyết định.');
      const values = [input.decision, input.error_type, input.corrected_value, input.note];
      if (mode === 'create')
        await c.execute<Rows>(
          'INSERT INTO review_decisions(decision,error_type,corrected_value,note,risk_case_id,reviewer_id,reviewed_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3))',
          [...values, id, reviewerId],
        );
      else
        await c.execute<Rows>(
          'UPDATE review_decisions SET decision=?,error_type=?,corrected_value=?,note=?,reviewer_id=?,version=version+1,reviewed_at=UTC_TIMESTAMP(3) WHERE risk_case_id=?',
          [...values, reviewerId, id],
        );
      const [[saved]] = await c.execute<Rows>(
        `SELECT ${fields} FROM review_decisions d WHERE d.risk_case_id=?`,
        [id],
      );
      await c.commit();
      return serialize(saved);
    } catch (error) {
      await c.rollback();
      throw error;
    } finally {
      c.release();
    }
  }
  async metrics(): Promise<Metrics> {
    const [[row]] = await this.pool.execute<Rows>(
      `SELECT COUNT(*) AS total_risk_cases,
   COALESCE(SUM(c.severity='high'),0) AS high, COALESCE(SUM(c.severity='medium'),0) AS medium,
   COUNT(d.risk_case_id) AS reviewed, COALESCE(SUM(d.decision='ERROR'),0) AS confirmed_errors,
   COALESCE(SUM(d.decision='CORRECT'),0) AS correct, COALESCE(SUM(d.decision='UNSURE'),0) AS unsure
   FROM risk_cases c LEFT JOIN review_decisions d ON d.risk_case_id=c.id WHERE c.dataset_revision_id=? AND c.is_suspicious=1`,
      [this.datasetId],
    );
    const m = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
    // The query selects exactly the counters Metrics names.
    return {
      ...(m as Omit<Metrics, 'unreviewed' | 'review_progress' | 'dataset_revision'>),
      unreviewed: m.total_risk_cases - m.reviewed,
      review_progress: m.total_risk_cases
        ? Math.round((m.reviewed / m.total_risk_cases) * 1000) / 10
        : 0,
      dataset_revision: this.dataset.meta.dataset_id,
    };
  }
}
