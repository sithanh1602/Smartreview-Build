import { normalizeDataset } from '../schema/normalize.mjs';
import { POLICY, POLICY_VERSION, MIN_SIDE, canonicalLabel, labelGroup } from './policy.mjs';
import { iou, isLabel } from './checks/shared.mjs';
import { temporalChecks } from './checks/temporal.mjs';
import { confidenceChecks } from './checks/confidence.mjs';
import { generalChecks } from './checks/general.mjs';
import { labelChecks } from './checks/labels.mjs';
import { imageRules } from './image-rules.mjs';
import * as legacy from '../risk_v1/engine.mjs';

export const checks = [...temporalChecks, ...confidenceChecks, ...generalChecks, ...labelChecks];
export { imageRules };
export const severity = (score) => (score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low');
export const ENGINE_VERSION = '4.0.0';
// The engine version is stored with the project at import time. Projects imported under a
// 2.x profile keep running on risk_v1, so their scores and dataset fingerprints never change.
export const LATEST_ENGINE_VERSION = ENGINE_VERSION;
export const LEGACY_ENGINE_VERSION = legacy.ENGINE_VERSION;
export function checksFor(version = ENGINE_VERSION) {
  return version === ENGINE_VERSION ? checks : legacy.checksFor(version);
}

// draft: model box at or above the working score. manual: no score, drawn by a person.
// grey: below the working score, a hint of a missed object rather than a label.
// ignored: below the minimum size of its label, neither right nor wrong.
function describe(annotation, index) {
  const g = annotation.geometry,
    label = canonicalLabel(annotation.label);
  const box = {
    id: annotation.id,
    index,
    label,
    group: labelGroup(label),
    confidence: annotation.confidence,
    geometry: g,
  };
  if (g.type !== 'bbox') return { ...box, state: 'unsupported' };
  Object.assign(box, {
    x1: g.x,
    y1: g.y,
    x2: g.x + g.width,
    y2: g.y + g.height,
    width: g.width,
    height: g.height,
    ratio: g.height / g.width,
  });
  const side = label === 'pole' ? g.height : Math.max(g.width, g.height);
  box.state =
    g.width <= 0 || g.height <= 0
      ? 'invalid'
      : side < (MIN_SIDE[label] ?? 0)
        ? 'ignored'
        : !Number.isFinite(annotation.confidence)
          ? 'manual'
          : annotation.confidence < POLICY.workingScore
            ? 'grey'
            : 'draft';
  return box;
}
// The strongest finding that names an error speaks for the box.
const leading = (findings) =>
  findings.reduce((top, f) => (f.error_type && (!top || f.score > top.score) ? f : top), null);

export function analyzeDataset(input, { minScore = 30, engineVersion = ENGINE_VERSION } = {}) {
  if (engineVersion !== ENGINE_VERSION)
    return legacy.analyzeDataset(input, { minScore, engineVersion });
  const data = normalizeDataset(input);
  const frames = new Map(data.frames.map((f) => [f.id, f]));
  const media = new Map(data.media.map((m) => [m.id, m]));
  const envRisk = data.dataset.metadata?.env_risk;
  const histories = new Map(),
    neighbors = new Map(),
    byFrame = new Map(data.frames.map((f) => [f.id, []]));
  data.annotations.forEach((a, index) => {
    byFrame.get(a.frame_id).push(describe(a, index));
    if (a.track_id === undefined) return;
    const key = JSON.stringify([frames.get(a.frame_id).media_id, a.track_id]);
    if (!histories.has(key)) histories.set(key, []);
    histories.get(key).push(a);
  });
  for (const history of histories.values()) {
    history.sort((a, b) => frames.get(a.frame_id).index - frames.get(b.frame_id).index);
    history.forEach((a, i) =>
      neighbors.set(a.id, { previous: history[i - 1], next: history[i + 1] }),
    );
  }
  const boxes = new Map([...byFrame.values()].flat().map((b) => [b.id, b]));
  const contexts = data.annotations.map((current) => {
    const frame = frames.get(current.frame_id);
    const risk = envRisk?.[frame.id];
    return {
      current,
      ...neighbors.get(current.id),
      frames,
      frame,
      media: media.get(frame.media_id),
      box: boxes.get(current.id),
      frameBoxes: byFrame.get(current.frame_id),
      env_risk: Number.isFinite(risk) ? risk : undefined,
    };
  });
  // A box suspected of being no object at all cannot serve as evidence against another box,
  // so rules that look at other boxes run after the suspects are known.
  const outcomes = new Map(contexts.map((c) => [c.current.id, new Map()]));
  const run = (relational) => {
    for (const context of contexts)
      for (const check of checks)
        if (!!check.relational === relational)
          outcomes.get(context.current.id).set(check.id, check.run(context));
  };
  run(false);
  const suspects = new Set(
    contexts
      .filter((c) => {
        const flagged = [...outcomes.get(c.current.id).values()].filter(
          (r) => r.status === 'flagged',
        );
        return leading(flagged)?.error_type === 'EXTRA_OBJECT';
      })
      .map((c) => c.current.id),
  );
  for (const context of contexts)
    context.peers = byFrame
      .get(context.current.frame_id)
      .filter((b) => b.id !== context.current.id && isLabel(b) && !suspects.has(b.id));
  run(true);

  const summary = Object.fromEntries(
    checks.map((c) => [
      c.id,
      { version: c.version, passed: 0, flagged: 0, skipped: 0, skip_reasons: {} },
    ]),
  );
  const results = contexts.map((context) => {
    const { current, frame, box } = context;
    const evaluations = checks.map((check) => {
      const result = outcomes.get(current.id).get(check.id);
      const stat = summary[check.id];
      stat[result.status]++;
      if (result.status === 'skipped')
        stat.skip_reasons[result.reason] = (stat.skip_reasons[result.reason] || 0) + 1;
      return { check_id: check.id, check_version: check.version, ...result };
    });
    const findings = foldWeak(evaluations.filter((e) => e.status === 'flagged'));
    const score = Math.min(
      100,
      findings.reduce((sum, f) => sum + f.score, 0),
    );
    const suspicion = leading(findings);
    return {
      id: current.id,
      dataset_id: data.dataset.id,
      reference: {
        annotation_id: current.id,
        frame_id: frame.id,
        frame_index: frame.index,
        media_id: context.media.id,
      },
      score,
      severity: severity(score),
      state: box.state,
      group: box.group,
      ...(suspicion && { suspected_error: suspicion.error_type }),
      ...(suspicion?.suggested_label && { suggested_label: suspicion.suggested_label }),
      reasons: findings.map((f) => f.reason),
      findings,
      check_ids: findings.map((f) => f.check_id),
      evaluations,
      context: Object.fromEntries(
        ['previous', 'current', 'next'].filter((k) => context[k]).map((k) => [k, context[k].id]),
      ),
    };
  });

  const scored = new Map(results.map((r) => [r.id, r]));
  // Imported files rarely say who drew the boxes; scores anywhere mean the set is model output.
  const hasScores = data.annotations.some((a) => Number.isFinite(a.confidence));
  const frameReports = data.frames.map((frame) =>
    triage(frame, byFrame.get(frame.id), scored, {
      env_risk: Number.isFinite(envRisk?.[frame.id]) ? envRisk[frame.id] : undefined,
      model:
        hasScores || (media.get(frame.media_id).source || data.dataset.source)?.kind === 'model',
    }),
  );
  return {
    schema_version: '1.0.0',
    engine_version: ENGINE_VERSION,
    policy_version: POLICY_VERSION,
    dataset_id: data.dataset.id,
    min_score: minScore,
    checks: summary,
    image_rules: Object.fromEntries(
      imageRules.map((r) => [
        r.id,
        {
          blocking: r.blocking,
          flagged: frameReports.filter((f) => f.image_rules.some((x) => x.rule_id === r.id)).length,
        },
      ]),
    ),
    tiers: Object.fromEntries(
      ['auto_accept', 'verify', 'relabel'].map((tier) => [
        tier,
        frameReports.filter((f) => f.tier === tier).length,
      ]),
    ),
    frames: frameReports,
    results,
    // Bonus labels are scored but kept out of the main queue.
    cases: queue(results.filter((r) => r.score >= minScore && r.group !== 'bonus')),
    advisory_cases: queue(results.filter((r) => r.score >= minScore && r.group === 'bonus')),
  };
}
const queue = (items) =>
  items.sort(
    (a, b) =>
      b.score - a.score ||
      a.reference.frame_index - b.reference.frame_index ||
      a.id.localeCompare(b.id),
  );
// A low score, a frame cut and a poor image all describe one thing, a weak box. Together they
// are one finding that counts once, at its strongest member; structural findings still add up.
const WEAK = new Set(checks.filter((c) => c.family === 'weak').map((c) => c.id));
function foldWeak(findings) {
  const weak = findings.filter((f) => WEAK.has(f.check_id));
  if (weak.length < 2) return findings;
  const error = weak.find((f) => f.error_type)?.error_type;
  const merged = {
    check_id: 'confidence.weak_box',
    check_version: '1.0.0',
    status: 'flagged',
    score: Math.max(...weak.map((f) => f.score)),
    reason: weak.map((f) => f.reason).join(' · '),
    evidence: {
      signals: weak.map(({ check_id, score, reason, evidence }) => ({
        check_id,
        score,
        reason,
        evidence,
      })),
    },
    ...(error && { error_type: error }),
  };
  return findings.flatMap((f) => (f === weak[0] ? [merged] : weak.includes(f) ? [] : [f]));
}

// The tier is decided here, with no reviewer in the loop: a frame is auto-accepted only when
// the policy gate (frame rules), the risk gate (box priority) and the confidence gate all hold.
function triage(frame, frameBoxes, scored, { env_risk, model }) {
  const { tier: T, coverage: C, autoAccept } = POLICY;
  const drafts = frameBoxes.filter((b) => b.state === 'draft');
  const greys = frameBoxes.filter((b) => b.state === 'grey' && b.confidence >= POLICY.greyFloor);
  const missing = greys.filter(
    (b) =>
      b.confidence >= C.greyScore &&
      Math.max(b.width, b.height) >= C.greySide &&
      drafts.every((d) => iou(b.geometry, d.geometry) < C.greyOverlap),
  );
  // Coverage rules describe model output; a frame labelled only by people has none to judge.
  const fired = model
    ? imageRules.flatMap((r) => {
        const hit = r.run({ drafts, greys, missing, env_risk });
        return hit ? [{ rule_id: r.id, blocking: r.blocking, ...hit }] : [];
      })
    : [];
  const unsupported = frameBoxes.filter((b) => b.state === 'unsupported');
  const flagged = frameBoxes.filter((b) => scored.get(b.id).score >= T.flagged);
  const blocking = flagged.filter((b) => b.group !== 'bonus');
  const high = blocking.filter((b) => scored.get(b.id).score >= T.high);
  const weak = drafts.filter((b) => b.group !== 'bonus' && b.confidence < autoAccept.minConfidence);
  const gates = {
    policy: !fired.some((r) => r.blocking) && !unsupported.length,
    risk: !blocking.length,
    confidence: !weak.length,
  };
  const tier =
    blocking.length >= T.relabelFlagged || high.length >= T.relabelHigh
      ? 'relabel'
      : Object.values(gates).every(Boolean)
        ? 'auto_accept'
        : 'verify';
  return {
    frame_id: frame.id,
    frame_index: frame.index,
    media_id: frame.media_id,
    tier,
    gates,
    ...(env_risk !== undefined && { env_risk }),
    counts: Object.fromEntries(
      ['draft', 'manual', 'grey', 'ignored', 'invalid', 'unsupported'].map((state) => [
        state,
        frameBoxes.filter((b) => b.state === state).length,
      ]),
    ),
    image_rules: fired,
    flagged: blocking.map((b) => b.id),
    advisory: flagged.filter((b) => b.group === 'bonus').map((b) => b.id),
    missing_candidates: missing.map((b) => b.id),
    reason: [
      blocking.length && `${blocking.length} box cần xem`,
      ...fired.filter((r) => r.blocking).map((r) => r.reason),
      unsupported.length && `${unsupported.length} annotation không phải bbox, chưa đánh giá được`,
      weak.length && `${weak.length} box dưới mức confidence tối thiểu`,
    ]
      .filter(Boolean)
      .join('; '),
  };
}
