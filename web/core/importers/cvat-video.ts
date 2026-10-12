import { applySignals } from './signals.ts';
import {
  cvatPoints,
  cvatSource,
  corners,
  emptyDataset,
  list,
  pad,
  parseXml,
  sizeOf,
} from './shared.ts';
import type { ImportOptions } from './signals.ts';
import type { Annotation } from '../schema/types.ts';

// CVAT for video 1.1: one XML of tracks, each a list of shapes by frame number. The export
// names its images images/frame_000000.<ext>; a shape marked outside is not on that frame.
export function importCvatVideo(xml: string, options: ImportOptions = {}) {
  const root = parseXml(xml, 'CVAT for video').annotations;
  if (!root || String(root.version) !== '1.1') throw new Error('Expected CVAT XML version 1.1');
  if (!root.track)
    throw new Error(
      'CVAT for video cần các <track>; tệp chỉ có <image> thì chọn CVAT for images 1.1.',
    );
  const task = root.meta?.task ?? root.meta?.job ?? {};
  const data = emptyDataset(
    options,
    { id: 'cvat-video', name: 'CVAT video annotations' },
    'CVAT for video 1.1',
  );
  const image = (frame: number) => `images/frame_${pad(frame)}`;
  const annotations: Annotation[] = [];
  const used = new Set<number>();
  for (const track of list(root.track)) {
    if (track.id == null || !track.label) throw new Error('CVAT track cần id và label.');
    for (const type of ['box', 'polygon', 'polyline'] as const)
      for (const shape of list(track[type])) {
        if (String(shape.outside) === '1') continue;
        if (shape.rotation != null && Number(shape.rotation) !== 0)
          throw new Error('Rotated boxes are not supported');
        const frame = Number(shape.frame);
        if (!Number.isSafeInteger(frame) || frame < 0)
          throw new Error(`CVAT track ${track.id}: frame “${shape.frame}” không hợp lệ.`);
        used.add(frame);
        annotations.push(
          applySignals({
            id: `track-${track.id}-frame-${frame}`,
            object_id: `track-${track.id}`,
            frame_id: `video:${frame}`,
            track_id: String(track.id),
            label: String(track.label),
            geometry:
              type === 'box'
                ? corners(
                    Number(shape.xtl),
                    Number(shape.ytl),
                    Number(shape.xbr),
                    Number(shape.ybr),
                  )
                : { type, points: cvatPoints(shape.points) },
            source: cvatSource(track.source),
            attributes: {
              ...Object.fromEntries(list(shape.attribute).map((v) => [v.name, v['#text'] ?? ''])),
              occluded: String(shape.occluded) === '1',
              keyframe: String(shape.keyframe) === '1',
            },
          }),
        );
      }
  }
  if (!used.size) throw new Error('CVAT for video: không có shape nào nằm trong khung hình.');
  const frames = [...used].sort((a, b) => a - b);
  const stated = task.original_size;
  const size =
    stated && Number(stated.width) > 0 && Number(stated.height) > 0
      ? { width: Number(stated.width), height: Number(stated.height) }
      : sizeOf(options, image(frames[0]).slice('images/'.length), 'CVAT for video');
  data.media.push({ id: 'video', name: String(task.name ?? 'video'), type: 'video', ...size });
  for (const frame of frames)
    data.frames.push({
      id: `video:${frame}`,
      media_id: 'video',
      index: frame,
      image: image(frame),
    });
  data.annotations = annotations;
  return data;
}
