import { createHash } from 'node:crypto';
import { ReviewError } from '../../shared/review.mjs';
const key = (id) => createHash('sha256').update(id).digest('hex');
const serialize = (row) => ({
  status: row.status,
  missing_regions:
    typeof row.missing_regions === 'string' ? JSON.parse(row.missing_regions) : row.missing_regions,
  note: row.note,
  version: row.version,
  updated_at: row.updated_at.replace(' ', 'T') + 'Z',
});
export class FrameReviewStore {
  constructor(pool, revision) {
    this.pool = pool;
    this.revision = revision;
  }
  async list() {
    const [rows] = await this.pool.execute(
      'SELECT * FROM frame_reviews WHERE dataset_revision_id=?',
      [this.revision],
    );
    return Object.fromEntries(rows.map((r) => [r.frame_reference, serialize(r)]));
  }
  async read(id) {
    const [rows] = await this.pool.execute(
      'SELECT * FROM frame_reviews WHERE dataset_revision_id=? AND frame_key=?',
      [this.revision, key(id)],
    );
    return rows[0] ? serialize(rows[0]) : null;
  }
  async save(id, input) {
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
        await c.execute(
          'INSERT INTO frame_reviews(status,missing_regions,note,dataset_revision_id,frame_key,frame_reference,updated_at) VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3))',
          [...values, id],
        );
      else {
        const [r] = await c.execute(
          'UPDATE frame_reviews SET status=?,missing_regions=?,note=?,version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE dataset_revision_id=? AND frame_key=? AND version=?',
          [...values, input.version],
        );
        if (!r.affectedRows)
          throw new ReviewError(
            409,
            'Đánh giá đã thay đổi ở nơi khác. Tải lại bản đã lưu trước khi chỉnh sửa.',
          );
      }
      const [[saved]] = await c.execute(
        'SELECT * FROM frame_reviews WHERE dataset_revision_id=? AND frame_key=?',
        [this.revision, key(id)],
      );
      await c.commit();
      return serialize(saved);
    } catch (e) {
      await c.rollback();
      if (e.code === 'ER_DUP_ENTRY')
        throw new ReviewError(409, 'Ảnh đã có đánh giá. Tải lại bản đã lưu.');
      throw e;
    } finally {
      c.release();
    }
  }
}
