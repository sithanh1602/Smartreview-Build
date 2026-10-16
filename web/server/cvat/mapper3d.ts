import type { Scene, SceneBox } from '../../core/risk3d/engine.ts';
import { annotationHash, type CvatJobData } from './mapper.ts';
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const TYPES: Record<string, string> = {
  car: 'VEHICLE',
  truck: 'VEHICLE',
  bus: 'VEHICLE',
  vehicle: 'VEHICLE',
  person: 'PEDESTRIAN',
  pedestrian: 'PEDESTRIAN',
  sign: 'SIGN',
  traffic_sign: 'SIGN',
  cyclist: 'CYCLIST',
};
export function mapCvat3D({ job, meta, labels, annotations }: CvatJobData) {
  if (job.dimension !== '3d') throw new Error('Job không phải 3D.');
  // Frame filters need explicit mapping; do not silently shift annotation frames.
  if (meta.frame_filter || meta.included_frames)
    throw new Error('3D hiện hỗ trợ frame liên tiếp, chưa hỗ trợ frame filter.');
  const start = Number(job.start_frame),
    stop = Number(job.stop_frame);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(stop) ||
    stop < start ||
    stop - start > 2000
  )
    throw new Error('Phạm vi frame 3D không hợp lệ hoặc vượt 2000 frame.');
  const names = new Map(labels.map((l) => [l.id, String(l.name)]));
  const skipped: { object_id: string; frame: number; reason: string }[] = [];
  const deleted = new Set(meta.deleted_frames ?? []);
  const scene: Scene = {
    segment: `cvat-job-${job.id}`,
    frames: Array.from({ length: stop - start + 1 }, (_, i) => ({
      timestamp: start + i,
      pose: [...IDENTITY],
      boxes: [],
    })),
  };
  const sources = new Map<string, { object_id: string; kind: 'shape' | 'track'; label: string }>();
  function add(s: any, labelId: number, id: string, kind: 'shape' | 'track', frame: number) {
    if (frame < start || frame > stop || deleted.has(frame) || s.outside) return;
    const skip = (reason: string) => skipped.push({ object_id: id, frame, reason });
    const label = names.get(labelId),
      p = s.points;
    if (!label) return skip('Không tìm thấy label cuboid.');
    if (s.type !== 'cuboid') return skip('Không phải cuboid 3D.');
    if (
      !Array.isArray(p) ||
      p.length < 9 ||
      !p.slice(0, 9).every(Number.isFinite) ||
      p.slice(6, 9).some((v: number) => v <= 0)
    )
      return skip('Tọa độ hoặc kích thước cuboid không hợp lệ.');
    if (Math.abs(p[3]) > 0.001 || Math.abs(p[4]) > 0.001)
      return skip('Core hiện chỉ hỗ trợ yaw; cuboid có roll/pitch chưa được chấm.');
    const box: SceneBox = {
      id: `${kind}:${id}`,
      type: TYPES[label.toLowerCase().replace(/[ -]+/g, '_')] ?? label.toUpperCase(),
      center: p.slice(0, 3),
      size: p.slice(6, 9),
      heading: p[5],
    };
    scene.frames[frame - start].boxes.push(box);
    sources.set(`${frame}:${box.id}`, { object_id: id, kind, label });
  }
  for (const s of annotations.shapes ?? []) add(s, s.label_id, String(s.id), 'shape', s.frame);
  for (const t of annotations.tracks ?? []) {
    const shapes = [...(t.shapes ?? [])].sort((a, b) => a.frame - b.frame);
    for (let i = 0; i < shapes.length; i++) {
      const s = shapes[i],
        next = shapes[i + 1];
      add(s, t.label_id, String(t.id), 'track', s.frame);
      // Preserve only explicit saved geometry. Do not guess CVAT 3D interpolation.
      const end = Math.min(stop, next ? next.frame - 1 : stop);
      if (!s.outside && end > Math.max(start - 1, s.frame))
        skipped.push({
          object_id: String(t.id),
          frame: Math.max(start, s.frame + 1),
          reason: `Frame nội suy ${Math.max(start, s.frame + 1)}–${end} chưa chấm; cần keyframe cuboid đã lưu.`,
        });
    }
  }
  return {
    scene,
    sources,
    skipped,
    hash: annotationHash({ job: job.id, meta, labels, annotations }),
  };
}
