import { createHash } from 'node:crypto';
import { normalizeDataset, SCHEMA_VERSION } from '../../core/schema/normalize.ts';
import type { Annotation, Dataset, Geometry, Point } from '../../core/schema/types.ts';

type Loose = Record<string, any>;
export interface CvatJobData {
  job: Loose;
  meta: Loose;
  labels: Loose[];
  annotations: Loose;
}

// Hash of the annotation as CVAT holds it: lets a re-scan tell whether anything changed.
export const annotationHash = (annotations: unknown) =>
  createHash('sha256').update(JSON.stringify(annotations)).digest('hex').slice(0, 16);

const SOURCE = { kind: 'import', name: 'CVAT API' } as const;

// CVAT job (2D images) -> SmartReview dataset. Anything not mapped faithfully is rejected
// or skipped with a recorded reason, never guessed.
export function mapCvatJob({ job, meta, labels, annotations }: CvatJobData) {
  if (job.dimension !== '2d') throw new Error('Chỉ hỗ trợ job 2D ở bước này.');
  if (job.media_type && job.media_type !== 'image') throw new Error('Chỉ hỗ trợ job ảnh.');
  const names = new Map(labels.map((l) => [l.id, String(l.name)]));
  const start = Number(meta.start_frame ?? job.start_frame ?? 0);
  const sizes = (meta.frames ?? []) as Loose[];
  const jobId = String(job.id);
  const skipped: { object_id: string; frame: number; reason: string }[] = [];
  const data: Dataset = {
    schema_version: SCHEMA_VERSION,
    dataset: {
      id: `cvat-job-${jobId}`,
      name: `CVAT job ${jobId} · ${job.task_name ?? ''}`.trim(),
      source: SOURCE,
      metadata: { cvat_job_id: job.id, cvat_task_id: job.task_id },
    },
    media: [],
    frames: [],
    annotations: [],
  };
  // CVAT frame numbers are task-wide; meta.frames lists the job's frames from start_frame.
  sizes.forEach((f, i) => {
    const frame = start + i,
      mediaId = `cvat-${jobId}-frame-${frame}`;
    data.media.push({
      id: mediaId,
      name: String(f.name ?? `frame-${frame}`),
      type: 'image',
      width: Number(f.width),
      height: Number(f.height),
    });
    data.frames.push({ id: `${mediaId}:0`, media_id: mediaId, index: 0 });
  });
  const frameId = (frame: number) => `cvat-${jobId}-frame-${frame}:0`;
  const known = new Set(data.frames.map((f) => f.id));
  for (const s of (annotations.shapes ?? []) as Loose[]) {
    const objectId = String(s.id);
    if (s.outside) continue;
    const label = names.get(s.label_id);
    if (!label) {
      skipped.push({ object_id: objectId, frame: s.frame, reason: 'label không xác định' });
      continue;
    }
    if (!known.has(frameId(s.frame))) {
      skipped.push({ object_id: objectId, frame: s.frame, reason: 'frame ngoài job' });
      continue;
    }
    if (Number(s.rotation ?? 0) !== 0) {
      skipped.push({ object_id: objectId, frame: s.frame, reason: 'box xoay chưa hỗ trợ' });
      continue;
    }
    const p = s.points as number[];
    let geometry: Geometry;
    if (s.type === 'rectangle')
      geometry = { type: 'bbox', x: p[0], y: p[1], width: p[2] - p[0], height: p[3] - p[1] };
    else if (s.type === 'polygon' || s.type === 'polyline') {
      const points: Point[] = [];
      for (let i = 0; i + 1 < p.length; i += 2) points.push([p[i], p[i + 1]]);
      geometry = { type: s.type, points };
    } else {
      skipped.push({ object_id: objectId, frame: s.frame, reason: `loại ${s.type} chưa hỗ trợ` });
      continue;
    }
    const a: Annotation = {
      id: `cvat-${jobId}-shape-${objectId}`,
      object_id: objectId,
      frame_id: frameId(s.frame),
      label,
      geometry,
      source: {
        kind: s.source === 'manual' ? 'human' : s.source === 'auto' ? 'model' : 'unknown',
        name: 'CVAT',
      },
      attributes: { cvat_job_id: job.id, cvat_shape_id: s.id, cvat_frame: s.frame },
    };
    data.annotations.push(a);
  }
  if ((annotations.tracks ?? []).length)
    skipped.push({
      object_id: '*',
      frame: -1,
      reason: `${annotations.tracks.length} track bị bỏ qua (chưa hỗ trợ)`,
    });
  return { dataset: normalizeDataset(data), skipped, hash: annotationHash(annotations) };
}
