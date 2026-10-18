import { ERROR_TYPES, ReviewError } from '../../shared/review.ts';
import { cvatCall } from './client.ts';
import type { Dataset, Geometry } from '../../core/schema/types.ts';
import type { HandoffReport } from '../projects/handoff.ts';

export interface CvatTask {
  task_id: number;
  job_id: number;
  url: string;
  // False when the task of this round was already in CVAT and is only opened again.
  created: boolean;
  // Issues of the job: what to fix and what to look at again, one per item of the report.
  issues: number;
}
// A note pinned to a region of a frame, shown on the image in CVAT.
export interface CvatIssue {
  frame_ref: string;
  geometry: Geometry;
  message: string;
}
const MAX_MESSAGE = 4000;

// The report as CVAT issues: confirmed errors, missing objects, then labels to look at again.
export function handoffIssues(report: HandoffReport): CvatIssue[] {
  const join = (...parts: (string | null | undefined | false)[]) =>
    parts.filter(Boolean).join(' · ');
  const why = (reasons: string[]) =>
    reasons.length ? `Lý do cảnh báo: ${reasons.slice(0, 3).join('; ')}` : null;
  return [
    ...report.errors.map((e) => ({
      frame_ref: e.frame_ref,
      geometry: e.geometry,
      message: join(
        `[Lỗi] ${ERROR_TYPES[e.error_type ?? 'OTHER']}: ${e.class_name}`,
        e.corrected_value && `sửa thành ${e.corrected_value}`,
        e.note && `Ghi chú: ${e.note}`,
        why(e.reasons),
      ),
    })),
    ...report.missing.map((m) => ({
      frame_ref: m.frame_ref,
      geometry: m.geometry,
      message: join(`[Thiếu nhãn] Vẽ thêm ${m.class_name || 'đối tượng'} tại vùng này`, m.note),
    })),
    ...(report.review ?? []).map((c) => ({
      frame_ref: c.frame_ref,
      geometry: c.geometry,
      message: join(
        `[Cần xem lại] ${c.annotation_id ? c.class_name : `có thể thiếu ${c.class_name}`}`,
        c.status === 'UNSURE' ? 'Reviewer chưa chắc' : 'chưa ai kiểm tra',
        `rủi ro ${Math.round(c.score)}`,
        c.note && `Ghi chú: ${c.note}`,
        why(c.reasons),
      ),
    })),
  ].map((i) => ({ ...i, message: i.message.slice(0, MAX_MESSAGE) }));
}
// [x1, y1, x2, y2] around a shape, as CVAT draws an issue; none for masks and cuboids.
function corners(g: Geometry): number[] | null {
  if (g.type === 'bbox') return [g.x, g.y, g.x + g.width, g.y + g.height];
  if (g.type !== 'polygon' && g.type !== 'polyline') return null;
  const xs = g.points.map((p) => p[0]),
    ys = g.points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
// Pins the issues on the job once: a job that has issues already keeps them.
async function pinIssues(jobId: number, dataset: Dataset, issues: CvatIssue[]) {
  const there = await cvatCall('GET', `/api/issues?job_id=${jobId}&page_size=1`);
  if (there?.count) return there.count as number;
  const frame = new Map(dataset.frames.map((f, i) => [f.id, i]));
  let made = 0;
  for (const issue of issues) {
    const position = corners(issue.geometry);
    if (!position || !frame.has(issue.frame_ref)) continue;
    await cvatCall('POST', '/api/issues', {
      job: jobId,
      frame: frame.get(issue.frame_ref),
      position,
      message: issue.message,
    });
    made++;
  }
  return made;
}
// Where the person opens CVAT; the API may sit on another address than the browser uses.
const uiBase = () => process.env.CVAT_UI_URL || process.env.CVAT_BASE_URL!;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// One push per task name at a time, so a double click does not make two tasks.
const running = new Map<string, Promise<CvatTask>>();

async function opened(
  taskId: number,
  created: boolean,
  dataset: Dataset,
  issues: CvatIssue[],
): Promise<CvatTask> {
  const jobs = await cvatCall('GET', `/api/jobs?task_id=${taskId}&page_size=1`);
  const job = jobs?.results?.[0]?.id;
  if (!job) throw new ReviewError(502, 'CVAT không tạo job cho task.');
  return {
    task_id: taskId,
    job_id: job,
    url: new URL(`/tasks/${taskId}/jobs/${job}`, uiBase()).toString(),
    created,
    issues: await pinIssues(job, dataset, issues),
  };
}

// CVAT shapes of the dataset, frame by frame in dataset order; masks and cuboids are left out.
export function cvatShapes(dataset: Dataset, labelIds: Map<string, number>) {
  const frame = new Map(dataset.frames.map((f, i) => [f.id, i]));
  return dataset.annotations.flatMap((a) => {
    const g = a.geometry,
      common = {
        frame: frame.get(a.frame_id)!,
        label_id: labelIds.get(a.label)!,
        occluded: false,
        z_order: 0,
        rotation: 0,
        source: 'manual',
        attributes: [],
      };
    if (g.type === 'bbox')
      return [{ ...common, type: 'rectangle', points: [g.x, g.y, g.x + g.width, g.y + g.height] }];
    if (g.type === 'polygon' || g.type === 'polyline')
      return [{ ...common, type: g.type, points: g.points.flat() }];
    return [];
  });
}

// Puts a dataset of images into CVAT as a task: its images in frame order, its labels as
// shapes and `issues` pinned on the frames. A task already named `name` is opened instead, so
// each round is one task.
export function pushToCvat(
  name: string,
  dataset: Dataset,
  image: (frameId: string) => Promise<Uint8Array | null>,
  issues: CvatIssue[] = [],
): Promise<CvatTask> {
  const pending = running.get(name);
  if (pending) return pending;
  const job = push(name, dataset, image, issues).finally(() => running.delete(name));
  running.set(name, job);
  return job;
}

async function push(
  name: string,
  dataset: Dataset,
  image: (frameId: string) => Promise<Uint8Array | null>,
  issues: CvatIssue[],
): Promise<CvatTask> {
  const found = await cvatCall('GET', `/api/tasks?name=${encodeURIComponent(name)}&page_size=50`);
  const same = found?.results?.find((t: { name: string }) => t.name === name);
  if (same) return opened(same.id, false, dataset, issues);
  const media = new Map(dataset.media.map((m) => [m.id, m]));
  if (dataset.frames.some((f) => media.get(f.media_id)?.type !== 'image'))
    throw new ReviewError(422, 'Chỉ đưa được dataset ảnh rời vào CVAT.');
  if (!dataset.frames.length) throw new ReviewError(422, 'Dataset không có ảnh nào.');
  const labels = [...new Set(dataset.annotations.map((a) => a.label))].sort();
  const task = await cvatCall('POST', '/api/tasks', {
    name,
    labels: (labels.length ? labels : ['object']).map((label) => ({ name: label })),
  });
  try {
    const form = new FormData();
    form.append('image_quality', '90');
    // Keeps the upload order, so CVAT frame i is dataset frame i.
    form.append('sorting_method', 'predefined');
    for (const [i, f] of dataset.frames.entries()) {
      const data = await image(f.id);
      if (!data)
        throw new ReviewError(
          409,
          `Thiếu ảnh ${media.get(f.media_id)!.name} trong kho của project.`,
        );
      const file = media.get(f.media_id)!.name.split(/[\\/]/).pop()!;
      form.append(`client_files[${i}]`, new Blob([new Uint8Array(data)]), file);
    }
    const { rq_id } = await cvatCall('POST', `/api/tasks/${task.id}/data`, form);
    for (let tries = 0; ; tries++) {
      const status = await cvatCall('GET', `/api/requests/${encodeURIComponent(rq_id)}`);
      if (status.status === 'finished') break;
      if (status.status === 'failed')
        throw new ReviewError(502, `CVAT không nhận ảnh: ${status.message || 'lỗi không rõ'}`);
      if (tries > 600) throw new ReviewError(504, 'CVAT xử lý ảnh quá 10 phút.');
      await sleep(1000);
    }
    const meta = await cvatCall('GET', `/api/tasks/${task.id}/data/meta`);
    if (meta.frames?.length !== dataset.frames.length)
      throw new ReviewError(
        502,
        `CVAT có ${meta.frames?.length ?? 0} frame, dataset có ${dataset.frames.length} ảnh.`,
      );
    const labelIds = new Map<string, number>();
    for (let page = 1; page < 50; page++) {
      const r = await cvatCall('GET', `/api/labels?task_id=${task.id}&page=${page}&page_size=100`);
      for (const l of r.results ?? []) labelIds.set(l.name, l.id);
      if (!r.next) break;
    }
    await cvatCall('PUT', `/api/tasks/${task.id}/annotations`, {
      version: 0,
      tags: [],
      tracks: [],
      shapes: cvatShapes(dataset, labelIds),
    });
    return await opened(task.id, true, dataset, issues);
  } catch (e) {
    // A half-made task would be opened as if it were complete next time.
    await cvatCall('DELETE', `/api/tasks/${task.id}`).catch(() => {});
    throw e;
  }
}
