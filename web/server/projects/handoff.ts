import { ReviewError } from '../../shared/review.ts';
import type { Untrusted, ReviewInput } from '../../shared/review.ts';
import { iou } from '../../core/risk/ai-compare.ts';
import type { Annotation, Geometry, Rect } from '../../core/schema/types.ts';
import type { FrameReview } from '../frames/store.ts';
import type { Review } from '../reviews/store.ts';
import type { Db, LoadedDataset, ProjectRole, Rows, User } from '../types.ts';
import type { Person, ProjectPeople } from './members.ts';

// Where something is, in the words the viewers and the file both use.
interface Place {
  frame_ref: string;
  frame_id: number;
  media_name: string;
  width: number;
  height: number;
  image_url: string | null;
  geometry: Geometry;
}
// A label a reviewer confirmed as wrong.
export interface HandoffError extends Place {
  id: string;
  annotation_id: string;
  class_name: string;
  score: number;
  reasons: string[];
  error_type: ReviewInput['error_type'];
  corrected_value: string | null;
  note: string | null;
}
// An object a reviewer marked as having no label.
export interface HandoffMissing extends Place {
  id: string;
  annotation_id: null;
  class_name: string;
  note: string;
}
// A label to look at again: the reviewer was unsure of it, or it is a risk case nobody
// reviewed. A suggested missing object has no annotation.
export interface HandoffCheck extends Place {
  id: string;
  annotation_id: string | null;
  class_name: string;
  score: number;
  reasons: string[];
  status: 'UNSURE' | 'UNREVIEWED';
  note: string | null;
}
// The file the annotators receive at the moment of sending: every confirmed error and missing
// object, and the labels to look at again. Reports sent before `review` existed lack it.
export interface HandoffReport {
  project: { id: string; name: string };
  dataset_revision: string;
  errors: HandoffError[];
  missing: HandoffMissing[];
  review?: HandoffCheck[];
}
// What became of a sent item in the file the annotator returned.
// unchanged: the same label and shape are still there. changed: a different label or shape
// is at that place now. removed: nothing is there any more. added / not_added: whether a
// label now covers a region that was marked as missing one.
export type Outcome = 'unchanged' | 'changed' | 'removed' | 'added' | 'not_added';
// What a reviewer made of a returned item: accept the fix, or reject it so the item is
// marked again and goes into the next round.
export interface Verdict {
  value: 'accept' | 'reject';
  note: string | null;
  by: string;
  at: string;
}
interface Checked {
  outcome: Outcome;
  // The annotation at that place in the returned dataset, to open in Review.
  now: { id: string; class_name: string; geometry: Geometry } | null;
  verdict?: Verdict;
}
export interface HandoffResult {
  dataset_revision: string;
  errors: (HandoffError & Checked)[];
  missing: (HandoffMissing & Checked)[];
  review?: (HandoffCheck & Checked)[];
}
export interface Handoff {
  // SENT: with the annotators, decisions locked. RETURNED: the annotators sent their fixed
  // file back, the project runs on it and the reviewers check again.
  status: 'SENT' | 'RETURNED';
  returned_at: string | null;
  returned_by_name: string | null;
  sent_at: string;
  sent_by_name: string;
  recipients: Person[];
  note: string;
  // Whether the dataset still is the one the report was made from.
  current: boolean;
  // Whether the signed-in user is one of the annotators it was sent to.
  for_me: boolean;
}
export const HANDOFF_LOCKED =
  'Review đã hoàn thành và đã gửi cho Annotator. Leader hoặc Reviewer mở lại review thì mới sửa được.';

export function buildReport(
  project: { id: string; name: string },
  dataset: LoadedDataset,
  reviews: Record<string, Review>,
  frameReviews: Record<string, FrameReview>,
  // Whether the reviewer chose to send the labels to look at again too.
  { review: withReview = false }: { review?: boolean } = {},
): HandoffReport {
  // A confirmed missing object goes to the annotators as a region to label, like one the
  // reviewer marked by hand.
  const confirmed = dataset.allCases.filter(
    (c) => reviews[c.id]?.decision === 'ERROR' && c.missing_object,
  );
  const errors = dataset.allCases
    .filter((c) => reviews[c.id]?.decision === 'ERROR' && !c.missing_object)
    .map((c): HandoffError => {
      const r = reviews[c.id];
      return {
        id: c.id,
        annotation_id: c.annotation_id,
        frame_ref: c.frame_ref,
        frame_id: c.frame_id,
        media_name: c.media_name,
        width: c.width,
        height: c.height,
        image_url: c.image_url,
        class_name: c.class_name,
        geometry: c.geometry,
        score: c.score,
        reasons: c.reasons,
        error_type: r.error_type as HandoffError['error_type'],
        corrected_value: r.corrected_value,
        note: r.note,
      };
    })
    .sort((a, b) => a.media_name.localeCompare(b.media_name) || a.frame_id - b.frame_id);
  const media = new Map(dataset.normalized.media.map((m) => [m.id, m]));
  const suggested = confirmed.map(
    (c): HandoffMissing => ({
      id: c.id,
      annotation_id: null,
      frame_ref: c.frame_ref,
      frame_id: c.frame_id,
      media_name: c.media_name,
      width: c.width,
      height: c.height,
      image_url: c.image_url,
      class_name: reviews[c.id].corrected_value || c.class_name,
      geometry: c.geometry,
      note: reviews[c.id].note ?? 'Model gợi ý, reviewer xác nhận thiếu box.',
    }),
  );
  const marked = dataset.normalized.frames.flatMap((f) => {
    const m = media.get(f.media_id)!;
    return (frameReviews[f.id]?.missing_regions || []).map(
      (region): HandoffMissing => ({
        id: `${f.id}:${region.id}`,
        annotation_id: null,
        frame_ref: f.id,
        frame_id: f.index,
        media_name: m.name,
        width: m.width,
        height: m.height,
        image_url: dataset.assets.has(f.id)
          ? `/api/projects/${project.id}/assets/${encodeURIComponent(f.id)}?dataset=${dataset.meta.dataset_id}`
          : null,
        class_name: region.label,
        geometry: region.geometry,
        note: region.note,
      }),
    );
  });
  const missing = [...suggested, ...marked].sort(
    (a, b) => a.media_name.localeCompare(b.media_name) || a.frame_id - b.frame_id,
  );
  // Unsure decisions on any label, and the risk queue's cases nobody decided on.
  const unsure = dataset.allCases.filter((c) => reviews[c.id]?.decision === 'UNSURE');
  const unreviewed = dataset.cases.filter((c) => !reviews[c.id]);
  const review = (withReview ? [...unsure, ...unreviewed] : [])
    .map(
      (c): HandoffCheck => ({
        id: c.id,
        annotation_id: c.missing_object ? null : c.annotation_id,
        frame_ref: c.frame_ref,
        frame_id: c.frame_id,
        media_name: c.media_name,
        width: c.width,
        height: c.height,
        image_url: c.image_url,
        class_name: c.class_name,
        geometry: c.geometry,
        score: c.score,
        reasons: c.reasons,
        status: reviews[c.id] ? 'UNSURE' : 'UNREVIEWED',
        note: reviews[c.id]?.note ?? null,
      }),
    )
    .sort((a, b) => a.media_name.localeCompare(b.media_name) || a.frame_id - b.frame_id);
  return { project, dataset_revision: dataset.meta.dataset_id, errors, missing, review };
}

const TOLERANCE = 0.51;
// Exports round coordinates to two decimals, so equal means equal within half a pixel.
export function sameShape(a: Geometry, b: Geometry) {
  const near = (x: number, y: number) => Math.abs(x - y) <= TOLERANCE;
  if (a.type === 'bbox' && b.type === 'bbox')
    return near(a.x, b.x) && near(a.y, b.y) && near(a.width, b.width) && near(a.height, b.height);
  if ((a.type === 'polygon' || a.type === 'polyline') && a.type === b.type)
    return (
      a.points.length === b.points.length &&
      a.points.every((p, i) => near(p[0], b.points[i][0]) && near(p[1], b.points[i][1]))
    );
  return JSON.stringify(a) === JSON.stringify(b);
}
const rect = (g: Geometry): Rect | null => (g.type === 'bbox' ? g : null);
// Compares what was sent with the dataset the annotator returned. `frames` maps a frame of
// the sent dataset to the same image in the returned one.
export function compareReturn(
  report: HandoffReport,
  returned: { dataset_revision: string; annotations: Annotation[] },
  frames: Map<string, string>,
  // Where the returned dataset serves the image of one of its frames.
  imageUrl: (frame: string) => string | null = () => null,
): HandoffResult {
  const byFrame = new Map<string, Annotation[]>();
  for (const a of returned.annotations)
    byFrame.set(a.frame_id, [...(byFrame.get(a.frame_id) ?? []), a]);
  const here = (frame: string) => byFrame.get(frames.get(frame) ?? '') ?? [];
  const view = (a: Annotation | undefined) =>
    a ? { id: a.id, class_name: a.label, geometry: a.geometry } : null;
  const nearest = (frame: string, g: Geometry) => {
    const box = rect(g);
    if (!box) return undefined;
    return here(frame)
      .map((a) => ({ a, overlap: rect(a.geometry) ? iou(box, rect(a.geometry)!) : 0 }))
      .filter((x) => x.overlap >= 0.3)
      .sort((x, y) => y.overlap - x.overlap)[0]?.a;
  };
  // The item, placed on the same image of the returned dataset.
  const moved = <T extends Place>(item: T): T => {
    const frame = frames.get(item.frame_ref) ?? item.frame_ref;
    return { ...item, frame_ref: frame, image_url: imageUrl(frame) };
  };
  // A sent label: still the same, changed at its place, or gone.
  const label = <T extends Place & { class_name: string }>(e: T): T & Checked => {
    const same = here(e.frame_ref).find(
      (a) => a.label === e.class_name && sameShape(a.geometry, e.geometry),
    );
    const now = same ?? nearest(e.frame_ref, e.geometry);
    return {
      ...moved(e),
      outcome: same ? 'unchanged' : now ? 'changed' : 'removed',
      now: view(now),
    };
  };
  // A region without a label: whether one covers it now.
  const region = <T extends Place>(m: T): T & Checked => {
    const now = nearest(m.frame_ref, m.geometry);
    return { ...moved(m), outcome: now ? 'added' : 'not_added', now: view(now) };
  };
  return {
    dataset_revision: returned.dataset_revision,
    errors: report.errors.map(label),
    missing: report.missing.map(region),
    review: (report.review ?? []).map((c) => (c.annotation_id ? label(c) : region(c))),
  };
}

const noTable = (e: unknown) => (e as { code?: string }).code === 'ER_NO_SUCH_TABLE';
const serialize = (row: Rows[number], revision: string | null, user: User): Handoff => {
  const recipients: Person[] =
    typeof row.recipients === 'string' ? JSON.parse(row.recipients) : row.recipients;
  return {
    status: row.status,
    returned_at: row.returned_at ? row.returned_at.replace(' ', 'T') + 'Z' : null,
    returned_by_name: row.returned_by_name,
    sent_at: row.sent_at.replace(' ', 'T') + 'Z',
    sent_by_name: row.sent_by_name,
    recipients,
    note: row.note,
    current: revision === null || row.dataset_fingerprint === revision,
    for_me: recipients.some((r) => r.id === user.id),
  };
};

export class ProjectHandoffs {
  pool: Db;
  constructor(pool: Db) {
    this.pool = pool;
  }
  // Null before migration 007 too, so projects keep working on a database that lacks the table.
  async row(projectId: string) {
    try {
      const [[row]] = await this.pool.execute<Rows>(
        'SELECT * FROM project_handoffs WHERE project_id=?',
        [projectId],
      );
      return row ?? null;
    } catch (e) {
      if (noTable(e)) return null;
      throw e;
    }
  }
  async get(projectId: string, user: User, revision: string | null = null) {
    const row = await this.row(projectId);
    return row ? serialize(row, revision, user) : null;
  }
  async locked(projectId: string) {
    return (await this.row(projectId))?.status === 'SENT';
  }
  // The report is for whoever reviews and for the annotators it was sent to.
  async report(projectId: string, user: User, role: ProjectRole, revision: string) {
    const row = await this.row(projectId);
    if (!row) throw new ReviewError(404, 'Project chưa được gửi cho Annotator.');
    const handoff = serialize(row, revision, user);
    if (role === 'annotator' && !handoff.for_me)
      throw new ReviewError(403, 'Kết quả review của project này không gửi cho bạn.');
    return {
      handoff,
      report: JSON.parse(row.report) as HandoffReport,
      result: row.result ? (JSON.parse(row.result) as HandoffResult) : null,
    };
  }
  // The sent report, for the annotator who is about to return a fixed file.
  async sent(projectId: string, user: User, role: ProjectRole) {
    const row = await this.row(projectId);
    if (row?.status !== 'SENT')
      throw new ReviewError(409, 'Project không ở trạng thái chờ Annotator gửi lại.');
    if (role === 'reviewer' || (role === 'annotator' && !serialize(row, null, user).for_me))
      throw new ReviewError(403, 'Chỉ Annotator được gửi mới gửi lại bản đã sửa.');
    return JSON.parse(row.report) as HandoffReport;
  }
  // The comparison of a returned round, for the reviewers to accept or reject item by item.
  async returnedResult(projectId: string) {
    const row = await this.row(projectId);
    if (row?.status !== 'RETURNED' || !row.result)
      throw new ReviewError(409, 'Project không có bản sửa nào đang chờ kiểm tra.');
    return JSON.parse(row.result) as HandoffResult;
  }
  async saveResult(projectId: string, result: HandoffResult) {
    await this.pool.execute<Rows>(
      "UPDATE project_handoffs SET result=? WHERE project_id=? AND status='RETURNED'",
      [JSON.stringify(result), projectId],
    );
  }
  async returned(projectId: string, user: User, result: HandoffResult) {
    await this.pool.execute<Rows>(
      "UPDATE project_handoffs SET status='RETURNED',returned_by_name=?,returned_at=UTC_TIMESTAMP(3),result=? WHERE project_id=?",
      [user.username, JSON.stringify(result), projectId],
    );
  }
  async send(
    projectId: string,
    input: Untrusted,
    user: User,
    people: ProjectPeople,
    report: HandoffReport,
  ) {
    const ids: unknown = input?.annotator_ids;
    if (!Array.isArray(ids) || !ids.length || ids.some((id) => typeof id !== 'string'))
      throw new ReviewError(400, 'Chọn ít nhất một Annotator để gửi.');
    const recipients = people.annotators
      .filter((a) => ids.includes(a.id))
      .map(({ id, username }) => ({ id, username }));
    if (recipients.length !== new Set(ids).size)
      throw new ReviewError(400, 'Chỉ gửi được cho Annotator của project này.');
    const note = input?.note ?? '';
    if (typeof note !== 'string' || note.length > 1000)
      throw new ReviewError(400, 'Ghi chú tối đa 1000 ký tự.');
    if (await this.locked(projectId))
      throw new ReviewError(409, 'Project này đã được gửi cho Annotator.');
    try {
      // A returned round is over: sending again starts the next one.
      await this.reopen(projectId);
      await this.pool.execute<Rows>(
        // UTC like returned_at; the column default is the database server's local time.
        'INSERT INTO project_handoffs(project_id,dataset_fingerprint,sent_by,sent_by_name,recipients,note,report,sent_at) VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP(3))',
        [
          projectId,
          report.dataset_revision,
          user.id,
          user.username,
          JSON.stringify(recipients),
          note.trim(),
          JSON.stringify(report),
        ],
      );
    } catch (e) {
      if (noTable(e))
        throw new ReviewError(
          503,
          'Database chưa có bảng project_handoffs. Chạy npm run db:migrate.',
        );
      if ((e as { code?: string }).code === 'ER_DUP_ENTRY')
        throw new ReviewError(409, 'Project này đã được gửi cho Annotator.');
      throw e;
    }
    return (await this.get(projectId, user, report.dataset_revision))!;
  }
  async reopen(projectId: string) {
    try {
      await this.pool.execute<Rows>('DELETE FROM project_handoffs WHERE project_id=?', [projectId]);
    } catch (e) {
      if (!noTable(e)) throw e;
    }
  }
}
