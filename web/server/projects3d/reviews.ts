import { createHash } from 'node:crypto';
import { ReviewError } from '../../shared/review.ts';
import type { ReviewInput, ReviewMode } from '../../shared/review.ts';
import type { Review } from '../reviews/store.ts';
import type { Db, Rows } from '../types.ts';

// One cuboid in one frame: what a 3D review decision is about.
export interface BoxRef {
  // "<frame timestamp>:<object id>", the name the API and the page use for it.
  key: string;
  timestamp: number;
  frameIndex: number;
  segment: string;
}
export const boxKey = (timestamp: number | string, objectId: string) => `${timestamp}:${objectId}`;
export interface ReviewSummary3D {
  reviewed: number;
  correct: number;
  errors: number;
  unsure: number;
}
const hash = (key: string) => createHash('sha256').update(key).digest('hex');
const fields = 'd.decision,d.error_type,d.corrected_value,d.note,d.version,d.reviewed_at';
const serialize = (row: Rows[number]) =>
  ({ ...row, reviewed_at: row.reviewed_at.replace(' ', 'T') + 'Z' }) as unknown as Review;

// Review decisions of one revision of a 3D project. The tables mirror the 2D ones: a row in
// risk_cases_3d names the cuboid and the decision hangs off it. No 3D risk engine runs yet, so
// a cuboid gets its row when it is first reviewed, with no score and no checks.
export class Review3DStore {
  pool: Db;
  revision: number;
  constructor(pool: Db, revision: number) {
    this.pool = pool;
    this.revision = revision;
  }
  async list(): Promise<Record<string, Review>> {
    const [rows] = await this.pool.execute<Rows>(
      `SELECT c.annotation_reference,${fields} FROM review_decisions_3d d JOIN risk_cases_3d c ON c.id=d.risk_case_id WHERE c.dataset_revision_id=?`,
      [this.revision],
    );
    return Object.fromEntries(
      rows.map(({ annotation_reference, ...r }) => [annotation_reference, serialize(r)]),
    );
  }
  async summary(): Promise<ReviewSummary3D> {
    const [[row]] = await this.pool.execute<Rows>(
      `SELECT COUNT(*) AS reviewed, COALESCE(SUM(d.decision='CORRECT'),0) AS correct,
   COALESCE(SUM(d.decision='ERROR'),0) AS errors, COALESCE(SUM(d.decision='UNSURE'),0) AS unsure
   FROM review_decisions_3d d JOIN risk_cases_3d c ON c.id=d.risk_case_id WHERE c.dataset_revision_id=?`,
      [this.revision],
    );
    return {
      reviewed: Number(row.reviewed),
      correct: Number(row.correct),
      errors: Number(row.errors),
      unsure: Number(row.unsure),
    };
  }
  // Saves the same decision on every given cuboid in three statements, whatever their number:
  // an object is in hundreds of frames. An existing decision is replaced and its version
  // raised. With `mode`, there is one cuboid and its version is checked first, as in 2D.
  async save(refs: BoxRef[], input: ReviewInput, reviewerId: string, mode?: ReviewMode) {
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      await c.query<Rows>(
        'INSERT IGNORE INTO risk_cases_3d(dataset_revision_id,annotation_key,annotation_reference,media_reference,frame_reference,frame_index,score,severity,is_suspicious,check_ids) VALUES ?',
        [
          refs.map((r) => [
            this.revision,
            hash(r.key),
            r.key,
            r.segment,
            String(r.timestamp),
            r.frameIndex,
            0,
            'low',
            0,
            '[]',
          ]),
        ],
      );
      const [cases] = await c.query<Rows>(
        'SELECT id FROM risk_cases_3d WHERE dataset_revision_id=? AND annotation_key IN (?)',
        [this.revision, refs.map((r) => hash(r.key))],
      );
      const ids = cases.map((row) => row.id);
      if (mode) {
        const [rows] = await c.query<Rows>(
          'SELECT version FROM review_decisions_3d WHERE risk_case_id IN (?) FOR UPDATE',
          [ids],
        );
        if (mode === 'create' && rows.length)
          throw new ReviewError(409, 'Review đã tồn tại. Tải lại quyết định rồi chỉnh sửa.');
        if (mode === 'update' && !rows.length) throw new ReviewError(404, 'Review chưa tồn tại.');
        if (mode === 'update' && rows[0].version !== input.version)
          throw new ReviewError(409, 'Review đã được chỉnh sửa ở nơi khác. Tải lại quyết định.');
      }
      await c.query<Rows>(
        `INSERT INTO review_decisions_3d(risk_case_id,decision,error_type,corrected_value,note,reviewer_id,reviewed_at) VALUES ?
   ON DUPLICATE KEY UPDATE decision=VALUES(decision),error_type=VALUES(error_type),corrected_value=VALUES(corrected_value),
   note=VALUES(note),reviewer_id=VALUES(reviewer_id),version=version+1,reviewed_at=VALUES(reviewed_at)`,
        [
          ids.map((id) => [
            id,
            input.decision,
            input.error_type,
            input.corrected_value,
            input.note,
            reviewerId,
            new Date().toISOString().slice(0, 23).replace('T', ' '),
          ]),
        ],
      );
      const [saved] = await c.query<Rows>(
        `SELECT c.annotation_reference,${fields} FROM review_decisions_3d d JOIN risk_cases_3d c ON c.id=d.risk_case_id WHERE d.risk_case_id IN (?)`,
        [ids],
      );
      await c.commit();
      return Object.fromEntries(
        saved.map(({ annotation_reference, ...r }) => [annotation_reference, serialize(r)]),
      ) as Record<string, Review>;
    } catch (error) {
      await c.rollback();
      throw error;
    } finally {
      c.release();
    }
  }
}
