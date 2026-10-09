// Optional model evidence; never changes annotation data or the rule-engine score.
export const AI_COMPARE_VERSION = '1.3.0';
export const AI_THRESHOLDS = Object.freeze({
  confidence: 0.65,
  classIou: 0.5,
  positionIou: 0.15,
  // Missing-object suggestions are stricter: a false alarm costs a reviewer a look.
  missingConfidence: 0.75,
  missingCoverage: 0.5,
  missingIou: 0.3,
  missingDuplicateIou: 0.5,
  // A small model often swaps car/truck/bus; only a very confident swap is worth a look.
  confusableConfidence: 0.85,
});
const MAX_FRAME_ANNOTATIONS = 50;
// Dataset label names that mean the same thing as a model class (BDD100K, Cityscapes, ...).
// "traffic sign" is deliberately absent: COCO only has "stop sign", which is a different class.
const LABEL_ALIASES = Object.freeze({
  bike: 'bicycle',
  motor: 'motorcycle',
  motorbike: 'motorcycle',
  rider: 'person',
  pedestrian: 'person',
});
const CONFUSABLE_GROUPS = [
  ['car', 'truck', 'bus'],
  ['bicycle', 'motorcycle'],
];
export const canonicalLabel = (label) => LABEL_ALIASES[String(label).toLowerCase()] ?? label;
const confusable = (a, b) => CONFUSABLE_GROUPS.some((g) => g.includes(a) && g.includes(b));
// Priority follows model confidence instead of a flat number, so a 0.66 guess ranks below a 0.95 one.
const classScore = (confidence, weak) =>
  Math.round(weak ? 20 + 30 * confidence : 40 + 45 * confidence);
const levelOf = (score) => (score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low');
export function iou(a, b) {
  const intersection =
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}
// Axis-aligned bounds of the geometry types we can reason about; null means unknown extent.
function bounds(g) {
  if (g?.type === 'bbox' && [g.x, g.y, g.width, g.height].every(Number.isFinite)) return g;
  if (['polygon', 'polyline'].includes(g?.type) && Array.isArray(g.points) && g.points.length) {
    const xs = g.points.map((p) => p[0]),
      ys = g.points.map((p) => p[1]);
    if (![...xs, ...ys].every(Number.isFinite)) return null;
    const x = Math.min(...xs),
      y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }
  return null;
}
const overlapArea = (a, b) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
export function comparePredictions(dataset, predictions, supportedLabels) {
  const supported = new Set(supportedLabels);
  const annotations = new Map();
  const detections = new Map();
  const skipped = {
    unsupported_geometry: 0,
    unsupported_label: 0,
    no_matching_prediction: 0,
    missing_unknown_geometry_frames: 0,
  };
  const frameIds = new Set(dataset.frames.map((f) => f.id));
  // Every annotation (any geometry/label) per frame: used only to decide what is already covered.
  const frameShapes = new Map();
  const datasetLabels = new Set();
  for (const a of dataset.annotations) {
    if (supported.has(canonicalLabel(a.label))) datasetLabels.add(canonicalLabel(a.label));
    if (!frameShapes.has(a.frame_id))
      frameShapes.set(a.frame_id, { boxes: [], unknown: false, list: [] });
    const shapes = frameShapes.get(a.frame_id),
      box = bounds(a.geometry);
    if (box) shapes.boxes.push(box);
    else shapes.unknown = true;
    if (shapes.list.length < MAX_FRAME_ANNOTATIONS)
      shapes.list.push({ id: a.id, annotation_id: a.id, label: a.label, geometry: a.geometry });
  }
  for (const a of dataset.annotations) {
    if (a.geometry.type !== 'bbox' || a.geometry.width <= 0 || a.geometry.height <= 0) {
      skipped.unsupported_geometry++;
      continue;
    }
    if (!supported.has(canonicalLabel(a.label))) {
      skipped.unsupported_label++;
      continue;
    }
    if (!annotations.has(a.frame_id)) annotations.set(a.frame_id, []);
    annotations.get(a.frame_id).push(a);
  }
  for (const p of predictions) {
    const g = p.geometry;
    if (
      !frameIds.has(p.frame_id) ||
      !supported.has(p.label) ||
      !Number.isFinite(p.confidence) ||
      p.confidence < AI_THRESHOLDS.confidence ||
      p.confidence > 1 ||
      g?.type !== 'bbox' ||
      ![g.x, g.y, g.width, g.height].every(Number.isFinite) ||
      g.width <= 0 ||
      g.height <= 0
    )
      continue;
    if (!detections.has(p.frame_id)) detections.set(p.frame_id, []);
    detections.get(p.frame_id).push(p);
  }
  const findings = [];
  let matched = 0;
  const frameOrder = new Set([...annotations.keys(), ...detections.keys()]);
  for (const frameId of frameOrder) {
    const group = annotations.get(frameId) || [];
    const edges = [];
    for (const a of group)
      for (const [index, p] of (detections.get(frameId) || []).entries()) {
        const overlap = iou(a.geometry, p.geometry);
        // Class disagreements need strong overlap. Position differences need the same label.
        if (
          overlap >= AI_THRESHOLDS.classIou ||
          (canonicalLabel(a.label) === p.label && overlap >= AI_THRESHOLDS.positionIou)
        )
          edges.push({ a, p, index, overlap });
      }
    // First reserve reliable same-label matches. Overlapping objects of different
    // classes (e.g. a person on a couch) must not steal those detections.
    // Weak same-label matches remain last so they cannot hide a strong class mismatch.
    const phase = (edge) =>
      canonicalLabel(edge.a.label) === edge.p.label ? (edge.overlap >= AI_THRESHOLDS.classIou ? 0 : 2) : 1;
    edges.sort(
      (a, b) =>
        phase(a) - phase(b) ||
        b.overlap - a.overlap ||
        b.p.confidence - a.p.confidence ||
        a.a.id.localeCompare(b.a.id),
    );
    const usedAnnotations = new Set(),
      usedPredictions = new Set();
    for (const { a, p, index, overlap } of edges) {
      if (usedAnnotations.has(a.id) || usedPredictions.has(index)) continue;
      usedAnnotations.add(a.id);
      usedPredictions.add(index);
      matched++;
      const own = canonicalLabel(a.label);
      const sameClass = own === p.label;
      const weak = !sameClass && confusable(own, p.label);
      // Matched, but a low-confidence swap inside a confusable family is not worth a reviewer's time.
      if (weak && p.confidence < AI_THRESHOLDS.confusableConfidence) continue;
      const checkId = !sameClass
        ? 'ai.class_disagreement'
        : overlap < AI_THRESHOLDS.classIou
          ? 'ai.bbox_disagreement'
          : null;
      if (!checkId) continue;
      const score = checkId === 'ai.class_disagreement' ? classScore(p.confidence, weak) : 50;
      findings.push({
        id: a.id,
        annotation_id: a.id,
        frame_id: frameId,
        check_id: checkId,
        score,
        severity: levelOf(score),
        confusable: weak,
        reason:
          checkId === 'ai.class_disagreement'
            ? weak
              ? `Nhãn hiện tại “${a.label}”, AI gợi ý “${p.label}” — hai lớp dễ nhầm nhau, cần xem kỹ.`
              : `Nhãn hiện tại “${a.label}”, AI gợi ý “${p.label}”.`
            : 'Khung annotation và khung AI cùng nhãn nhưng trùng khớp thấp.',
        annotation: { label: a.label, geometry: a.geometry },
        prediction: {
          label: p.label,
          confidence: p.confidence,
          geometry: p.geometry,
        },
        iou: overlap,
      });
    }
    skipped.no_matching_prediction += group.length - usedAnnotations.size;
    // Confident detections that matched no annotation and are not inside any existing shape.
    const candidates = (detections.get(frameId) || [])
      .map((p, index) => ({ p, index }))
      .filter(
        ({ p, index }) =>
          !usedPredictions.has(index) &&
          datasetLabels.has(p.label) &&
          p.confidence >= AI_THRESHOLDS.missingConfidence,
      )
      .sort((x, y) => y.p.confidence - x.p.confidence);
    if (!candidates.length) continue;
    const shapes = frameShapes.get(frameId) || { boxes: [], unknown: false, list: [] };
    // A mask/3D annotation has no known extent, so we cannot prove an object is uncovered.
    if (shapes.unknown) {
      skipped.missing_unknown_geometry_frames++;
      continue;
    }
    const accepted = [];
    for (const { p } of candidates) {
      const area = p.geometry.width * p.geometry.height;
      const covered = shapes.boxes.some(
        (box) =>
          overlapArea(box, p.geometry) / area >= AI_THRESHOLDS.missingCoverage ||
          iou(box, p.geometry) >= AI_THRESHOLDS.missingIou,
      );
      // The same object can be detected under two classes; keep only the most confident.
      if (
        covered ||
        accepted.some((q) => iou(q.geometry, p.geometry) >= AI_THRESHOLDS.missingDuplicateIou)
      )
        continue;
      accepted.push(p);
      const score = Math.round(40 + 40 * p.confidence);
      findings.push({
        id: `missing:${frameId}:${accepted.length}`,
        annotation_id: null,
        frame_id: frameId,
        check_id: 'ai.missing_annotation',
        score,
        severity: score >= 70 ? 'high' : 'medium',
        reason: `AI thấy “${p.label}” (${(p.confidence * 100).toFixed(0)}%) nhưng chưa có annotation tại vị trí này.`,
        annotation: null,
        prediction: { label: p.label, confidence: p.confidence, geometry: p.geometry },
        iou: null,
        frame_annotations: shapes.list,
      });
    }
  }
  findings.sort(
    (a, b) =>
      b.score - a.score ||
      b.prediction.confidence - a.prediction.confidence ||
      a.id.localeCompare(b.id),
  );
  return {
    comparison_version: AI_COMPARE_VERSION,
    thresholds: AI_THRESHOLDS,
    matched_annotations: matched,
    skipped,
    findings,
  };
}
