import { createHash } from 'node:crypto';
import { ReviewError } from '../../shared/review.ts';
import type { FrameReviewStatus, MissingRegion } from '../../shared/frame-review.ts';
import type { Db, Result, Rows } from '../types.ts';

export interface FrameReview {
  status: FrameReviewStatus;
  missing_regions: MissingRegion[];
  note: string;
  version: number;
  updated_at: string;
}
const key = (id: string) => createHash('sha256').update(id).digest('hex');
const serialize = (row: Rows[number]): FrameReview => ({
  status: row.status,
  missing_regions:
    typeof row.missing_regions === 'string' ? JSON.parse(row.missing_regions) : row.missing_regions,
  note: row.note,
  version: row.version,
  updated_at: row.updated_at.replace(' ', 'T') + 'Z',
});
export class FrameReviewStore {
  pool: Db;
  revision: number | null;
  constructor(pool: Db, revision: number | null) {
    this.pool = pool;
    this.revision = revision;
  }
  async list(): Promise<Record<string, FrameReview>> {
    const [rows] = await this.pool.execute<Rows>(
      'SELECT * FROM frame_reviews WHERE dataset_revision_id=?',
      [this.revision],
    );
    return Object.fromEntries(rows.map((r) => [r.frame_reference, serialize(r)]));
  }
  async read(id: string) {
    const [rows] = await this.pool.execute<Rows>(
      'SELECT * FROM frame_reviews WHERE dataset_revision_id=? AND frame_key=?',
      [this.revision, key(id)],
    );
    return rows[0] ? serialize(rows[0]) : null;
  }
  async save(
    id: string,
    input: Pick<FrameReview, 'status' | 'missing_regions' | 'note' | 'version'>,
  ) {
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      const values = [
        input.status,
        JSON.stringify(input.missing_regions),
        input.note,
        this.revision,
        key(id),
      ];
      if (input.version === 0)
        await c.execute<Rows>(
          'INSERT INTO frame_reviews(status,missing_regions,note,dataset_revision_id,frame_key,frame_reference,updated_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3))',
          [...values, id],
        );
      else {
        const [r] = await c.execute<Result>(
          'UPDATE frame_reviews SET status=?,missing_regions=?,note=?,version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE dataset_revision_id=? AND frame_key=? AND version=?',
          [...values, input.version],
        );
        if (!r.affectedRows)
          throw new ReviewError(
            409,
            'Đánh giá đã thay đổi ở nơi khác. Tải lại bản đã lưu trước khi chỉnh sửa.',
          );
      }
      const [[saved]] = await c.execute<Rows>(
        'SELECT * FROM frame_reviews WHERE dataset_revision_id=? AND frame_key=?',
        [this.revision, key(id)],
      );
      await c.commit();
      return serialize(saved);
    } catch (e) {
      await c.rollback();
      if ((e as { code?: string }).code === 'ER_DUP_ENTRY')
        throw new ReviewError(409, 'Ảnh đã có đánh giá. Tải lại bản đã lưu.');
      throw e;
    } finally {
      c.release();
    }
  }
}
