// Single-image checks: they need neither track IDs nor confidence, so they also cover
// plain image datasets (CVAT images, COCO). Introduced with engine profile 2.1.0.
import { iou } from '../../risk/ai-compare.mjs';
import { skip, pass, flag } from './shared.mjs';

export const DUPLICATE_IOU = 0.85;
export const MAX_SIBLINGS = 500;
export const MIN_LABEL_SAMPLES = 20;
export const SIZE_OUTLIER_Z = 4;
export const MIN_SIDE_PX = 4;
export const MIN_AREA_RATIO = 0.00001;
export const EXTREME_ASPECT = 20;

const positiveBox = (a) =>
  a.geometry.type === 'bbox' && a.geometry.width > 0 && a.geometry.height > 0;

export const duplicateCheck = {
  id: 'geometry.bbox_duplicate',
  version: '1.0.0',
  run({ current, siblings = [] }) {
    if (!positiveBox(current)) return skip('unsupported_geometry');
    if (siblings.length > MAX_SIBLINGS) return skip('too_many_annotations_in_frame');
    let best = null;
    for (const other of siblings) {
      // Only the later annotation of a pair is flagged, so one pair yields one case.
      if (other.id === current.id || other.id > current.id || !positiveBox(other)) continue;
      const overlap = iou(current.geometry, other.geometry);
      if (overlap >= DUPLICATE_IOU && (!best || overlap > best.overlap)) best = { other, overlap };
    }
    if (!best) return pass();
    const sameLabel = best.other.label === current.label;
    return flag(
      sameLabel ? 50 : 45,
      sameLabel
        ? `BBox trùng lặp với ${best.other.id} (IoU ${best.overlap.toFixed(2)}).`
        : `Cùng một khung nhưng khác nhãn: ${best.other.label} / ${current.label} (IoU ${best.overlap.toFixed(2)}).`,
      {
        annotation_ids: [best.other.id, current.id],
        labels: [best.other.label, current.label],
        same_label: sameLabel,
        iou: best.overlap,
        threshold: DUPLICATE_IOU,
      },
    );
  },
};

export const tinyCheck = {
  id: 'geometry.bbox_tiny',
  version: '1.0.0',
  run({ current, media }) {
    if (!positiveBox(current)) return skip('unsupported_geometry');
    const { width, height } = current.geometry;
    const ratio = (width * height) / (media.width * media.height);
    if (Math.min(width, height) >= MIN_SIDE_PX && ratio >= MIN_AREA_RATIO) return pass();
    return flag(35, `BBox quá nhỏ: ${width.toFixed(1)}×${height.toFixed(1)} px.`, {
      width,
      height,
      area_ratio: ratio,
      min_side_px: MIN_SIDE_PX,
      min_area_ratio: MIN_AREA_RATIO,
    });
  },
};

export const aspectCheck = {
  id: 'geometry.bbox_aspect',
  version: '1.0.0',
  run({ current }) {
    if (!positiveBox(current)) return skip('unsupported_geometry');
    const { width, height } = current.geometry;
    const ratio = Math.max(width / height, height / width);
    return ratio >= EXTREME_ASPECT
      ? flag(25, `Tỷ lệ cạnh bất thường: ${ratio.toFixed(1)}:1.`, {
          width,
          height,
          ratio,
          threshold: EXTREME_ASPECT,
        })
      : pass();
  },
};

// Robust per-label size statistics (median/MAD of log relative area).
export function labelSizeStats(annotations, mediaById, frameById) {
  const logs = new Map();
  for (const a of annotations) {
    if (!positiveBox(a)) continue;
    const media = mediaById.get(frameById.get(a.frame_id).media_id);
    const ratio = (a.geometry.width * a.geometry.height) / (media.width * media.height);
    if (!(ratio > 0)) continue;
    if (!logs.has(a.label)) logs.set(a.label, []);
    logs.get(a.label).push(Math.log(ratio));
  }
  const median = (values) => {
    const sorted = [...values].sort((x, y) => x - y);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const stats = new Map();
  for (const [label, values] of logs) {
    const center = median(values);
    stats.set(label, {
      n: values.length,
      median: center,
      mad: median(values.map((v) => Math.abs(v - center))),
    });
  }
  return stats;
}

export const sizeOutlierCheck = {
  id: 'geometry.bbox_size_outlier',
  version: '1.0.0',
  run({ current, media, stats }) {
    if (!positiveBox(current)) return skip('unsupported_geometry');
    const s = stats?.get(current.label);
    if (!s || s.n < MIN_LABEL_SAMPLES) return skip('insufficient_label_samples');
    const ratio = (current.geometry.width * current.geometry.height) / (media.width * media.height);
    // Floor the spread so a very uniform label does not flag ordinary variation.
    const sigma = Math.max(1.4826 * s.mad, 0.35);
    const z = Math.abs(Math.log(ratio) - s.median) / sigma;
    return z >= SIZE_OUTLIER_Z
      ? flag(
          30,
          `Kích thước bất thường so với các “${current.label}” khác (${z.toFixed(1)} độ lệch).`,
          {
            area_ratio: ratio,
            label: current.label,
            label_samples: s.n,
            typical_area_ratio: Math.exp(s.median),
            z,
            threshold: SIZE_OUTLIER_Z,
          },
        )
      : pass();
  },
};

export const imageChecks = [duplicateCheck, tinyCheck, aspectCheck, sizeOutlierCheck];
