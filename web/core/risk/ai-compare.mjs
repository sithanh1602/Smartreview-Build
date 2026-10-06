// Optional model evidence; never changes annotation data or the rule-engine score.
export const AI_COMPARE_VERSION = '1.1.0';
export const AI_THRESHOLDS = Object.freeze({
  confidence: 0.65,
  classIou: 0.5,
  positionIou: 0.15,
});
export function iou(a, b) {
  const intersection =
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}
export function comparePredictions(dataset, predictions, supportedLabels) {
  const supported = new Set(supportedLabels);
  const annotations = new Map();
  const detections = new Map();
  const skipped = {
    unsupported_geometry: 0,
    unsupported_label: 0,
    no_matching_prediction: 0,
  };
  const frameIds = new Set(dataset.frames.map((f) => f.id));
  for (const a of dataset.annotations) {
    if (a.geometry.type !== 'bbox' || a.geometry.width <= 0 || a.geometry.height <= 0) {
      skipped.unsupported_geometry++;
      continue;
    }
    if (!supported.has(a.label)) {
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
  for (const [frameId, group] of annotations) {
    const edges = [];
    for (const a of group)
      for (const [index, p] of (detections.get(frameId) || []).entries()) {
        const overlap = iou(a.geometry, p.geometry);
        // Class disagreements need strong overlap. Position differences need the same label.
        if (
          overlap >= AI_THRESHOLDS.classIou ||
          (a.label === p.label && overlap >= AI_THRESHOLDS.positionIou)
        )
          edges.push({ a, p, index, overlap });
      }
    // First reserve reliable same-label matches. Overlapping objects of different
    // classes (e.g. a person on a couch) must not steal those detections.
    // Weak same-label matches remain last so they cannot hide a strong class mismatch.
    const phase = (edge) =>
      edge.a.label === edge.p.label ? (edge.overlap >= AI_THRESHOLDS.classIou ? 0 : 2) : 1;
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
      const checkId =
        a.label !== p.label
          ? 'ai.class_disagreement'
          : overlap < AI_THRESHOLDS.classIou
            ? 'ai.bbox_disagreement'
            : null;
      if (!checkId) continue;
      findings.push({
        id: a.id,
        annotation_id: a.id,
        frame_id: frameId,
        check_id: checkId,
        score: checkId === 'ai.class_disagreement' ? 70 : 50,
        severity: checkId === 'ai.class_disagreement' ? 'high' : 'medium',
        reason:
          checkId === 'ai.class_disagreement'
            ? `Nhãn hiện tại “${a.label}”, AI gợi ý “${p.label}”.`
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
