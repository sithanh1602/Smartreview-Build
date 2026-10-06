import { normalizeDataset, SCHEMA_VERSION } from '../schema/normalize.mjs';

// The only adapter that understands the existing tracks.json structure.
export function importDemo(tracks, metadata) {
  return normalizeDataset({
    schema_version: SCHEMA_VERSION,
    dataset: {
      id: 'traffic-demo',
      name: 'Traffic · demo dataset',
      source: { kind: 'model', name: 'YOLO + ByteTrack (optional demo)' },
    },
    media: [
      {
        id: 'traffic',
        name: metadata.name,
        type: 'video',
        width: metadata.width,
        height: metadata.height,
        fps: metadata.fps,
        frame_count: metadata.frame_count,
      },
    ],
    frames: tracks.map((f) => ({
      id: `traffic:${f.frame_id}`,
      media_id: 'traffic',
      index: f.frame_id,
    })),
    annotations: tracks.flatMap((f) =>
      f.objects.map((o) => ({
        id: `${o.track_id}-${f.frame_id}`,
        object_id: String(o.track_id),
        frame_id: `traffic:${f.frame_id}`,
        label: o.class_name,
        track_id: String(o.track_id),
        ...(o.confidence == null ? {} : { confidence: o.confidence }),
        geometry: {
          type: 'bbox',
          x: o.bbox.x1,
          y: o.bbox.y1,
          width: o.bbox.x2 - o.bbox.x1,
          height: o.bbox.y2 - o.bbox.y1,
        },
      })),
    ),
  });
}
