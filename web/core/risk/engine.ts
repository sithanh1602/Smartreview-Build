import { normalizeDataset } from '../schema/normalize.ts';
import { POLICY, POLICY_VERSION, MIN_SIDE, canonicalLabel, labelGroup } from './policy.ts';
import { iou, isLabel } from './checks/shared.ts';
import { temporalChecks } from './checks/temporal.ts';
import { confidenceChecks } from './checks/confidence.ts';
import { generalChecks } from './checks/general.ts';
import { labelChecks } from './checks/labels.ts';
import { imageRules } from './image-rules.ts';
import * as legacy from '../risk_v1/engine.ts';
import type { Annotation, Frame } from '../schema/types.ts';
import type {
  AnalyzeOptions,
  Box,
  Check,
  CheckContext,
  CheckResult,
  CheckStat,
  ContextPosition,
  DraftBox,
  Evaluation,
  Finding,
  FrameReport,
  GreyBox,
  LegacyRiskReport,
  RiskReport,
  RiskResult,
  Severity,
  Tier,
} from './types.ts';

export const checks: Check[] = [
  ...temporalChecks,
  ...confidenceChecks,
  ...generalChecks,
  ...labelChecks,
];
export { imageRules };
export const severity = (score: number): Severity =>
  score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
export const ENGINE_VERSION = '4.0.0';
// The engine version is stored with the project at import time. Projects imported under a
// 2.x profile keep running on risk_v1, so their scores and dataset fingerprints never change.
export const LATEST_ENGINE_VERSION = ENGINE_VERSION;
export const LEGACY_ENGINE_VERSION = legacy.ENGINE_VERSION;
export function checksFor(version = ENGINE_VERSION): { id: string; version: string }[] {
  return version === ENGINE_VERSION ? checks : legacy.checksFor(version);
}

// draft: model box at or above the working score. manual: no score, drawn by a person.
// grey: below the working score, a hint of a missed object rather than a label.
// ignored: below the minimum size of its label, neither right nor wrong.
function describe(annotation: Annotation, index: number): Box {
  const g = annotation.geometry,
    label = canonicalLabel(annotation.label),
    confidence = annotation.confidence;
  const box = { id: annotation.id, index, label, group: labelGroup(label), confidence };
  if (g.type !== 'bbox') return { ...box, geometry: g, state: 'unsupported' };
  const measured = {
    ...box,
    geometry: g,
    x1: g.x,
    y1: g.y,
    x2: g.x + g.width,
    y2: g.y + g.height,
    width: g.width,
    height: g.height,
    ratio: g.height / g.width,
  };
  const side = label === 'pole' ? g.height : Math.max(g.width, g.height);
  if (g.width <= 0 || g.height <= 0) return { ...measured, state: 'invalid' };
  if (side < (MIN_SIDE[label] ?? 0)) return { ...measured, state: 'ignored' };
  if (confidence === undefined || !Number.isFinite(confidence))
    return { ...measured, state: 'manual' };
  return { ...measured, confidence, state: confidence < POLICY.workingScore ? 'grey' : 'draft' };
}
// The strongest finding that names an error speaks for the box.
const leading = <T extends { score: number; error_type?: string }>(findings: T[]) =>
  findings.reduce<T | null>(
    (top, f) => (f.error_type && (!top || f.score > top.score) ? f : top),
    null,
  );

// Without an engine version the current engine runs, so the report has frames and tiers.
export function analyzeDataset(input: unknown, options?: { minScore?: number }): RiskReport;
export function analyzeDataset(
  input: unknown,
  options?: AnalyzeOptions,
): RiskReport | LegacyRiskReport;
export function analyzeDataset(
  input: unknown,
  { minScore = 30, engineVersion = ENGINE_VERSION }: AnalyzeOptions = {},
): RiskReport | LegacyRiskReport {
  if (engineVersion !== ENGINE_VERSION)
    return legacy.analyzeDataset(input, { minScore, engineVersion });
  const data = normalizeDataset(input);
  const frames = new Map(data.frames.map((f) => [f.id, f]));
  const media = new Map(data.media.map((m) => [m.id, m]));
  const envRisk = data.dataset.metadata?.env_risk as Record<string, unknown> | undefined;
  const frameRisk = (frame: Frame) => {
    const risk = envRisk?.[frame.id];
    return typeof risk === 'number' && Number.isFinite(risk) ? risk : undefined;
  };
  const histories = new Map<string, Annotation[]>(),
    neighbors = new Map<string, { previous?: Annotation; next?: Annotation }>(),
    byFrame = new Map(data.frames.map((f) => [f.id, [] as Box[]]));
  data.annotations.forEach((a, index) => {
    byFrame.get(a.frame_id)!.push(describe(a, index));
    if (a.track_id === undefined) return;
    const key = JSON.stringify([frames.get(a.frame_id)!.media_id, a.track_id]);
    if (!histories.has(key)) histories.set(key, []);
    histories.get(key)!.push(a);
  });
  for (const history of histories.values()) {
    history.sort((a, b) => frames.get(a.frame_id)!.index - frames.get(b.frame_id)!.index);
    history.forEach((a, i) =>
      neighbors.set(a.id, { previous: history[i - 1], next: history[i + 1] }),
    );
  }
  const boxes = new Map([...byFrame.values()].flat().map((b) => [b.id, b]));
  const contexts = data.annotations.map((current): CheckContext => {
    const frame = frames.get(current.frame_id)!;
    return {
      current,
      ...neighbors.get(current.id),
      frames,
      frame,
      media: media.get(frame.media_id)!,
      box: boxes.get(current.id)!,
      frameBoxes: byFrame.get(current.frame_id)!,
      env_risk: frameRisk(frame),
      peers: [],
    };
  });
  // A box suspected of being no object at all cannot serve as evidence against another box,
  // so rules that look at other boxes run after the suspects are known.
  const outcomes = new Map(contexts.map((c) => [c.current.id, new Map<string, CheckResult>()]));
  const run = (relational: boolean) => {
    for (const context of contexts)
      for (const check of checks)
        if (!!check.relational === relational)
          outcomes.get(context.current.id)!.set(check.id, check.run(context));
  };
  run(false);
  const suspects = new Set(
    contexts
      .filter((c) => {
        const flagged = [...outcomes.get(c.current.id)!.values()].filter(
          (r) => r.status === 'flagged',
        );
        return leading(flagged)?.error_type === 'EXTRA_OBJECT';
      })
      .map((c) => c.current.id),
  );
  for (const context of contexts)
    context.peers = byFrame
      .get(context.current.frame_id)!
      .filter(isLabel)
      .filter((b) => b.id !== context.current.id && !suspects.has(b.id));
  run(true);

  const summary: Record<string, CheckStat> = Object.fromEntries(
    checks.map((c) => [
      c.id,
      { version: c.version, passed: 0, flagged: 0, skipped: 0, skip_reasons: {} },
    ]),
  );
  const results = contexts.map((context): RiskResult => {
    const { current, frame, box } = context;
    const evaluations = checks.map((check): Evaluation => {
      const result = outcomes.get(current.id)!.get(check.id)!;
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
        POSITIONS.flatMap((k) => {
          const neighbor = context[k];
          return neighbor ? [[k, neighbor.id]] : [];
        }),
      ),
    };
  });

  const scored = new Map(results.map((r) => [r.id, r]));
  // Imported files rarely say who drew the boxes; scores anywhere mean the set is model output.
  const hasScores = data.annotations.some((a) => Number.isFinite(a.confidence));
  const frameReports = data.frames.map((frame) =>
    triage(frame, byFrame.get(frame.id)!, scored, {
      env_risk: frameRisk(frame),
      model:
        hasScores || (media.get(frame.media_id)!.source || data.dataset.source)?.kind === 'model',
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
      TIERS.map((tier) => [tier, frameReports.filter((f) => f.tier === tier).length]),
    ),
    frames: frameReports,
    results,
    // Bonus labels are scored but kept out of the main queue.
    cases: queue(results.filter((r) => r.score >= minScore && r.group !== 'bonus')),
    advisory_cases: queue(results.filter((r) => r.score >= minScore && r.group === 'bonus')),
  };
}
const POSITIONS: ContextPosition[] = ['previous', 'current', 'next'];
const TIERS: Tier[] = ['auto_accept', 'verify', 'relabel'];
const queue = (items: RiskResult[]) =>
  items.sort(
    (a, b) =>
      b.score - a.score ||
      a.reference.frame_index - b.reference.frame_index ||
      a.id.localeCompare(b.id),
  );
// A low score, a frame cut and a poor image all describe one thing, a weak box. Together they
// are one finding that counts once, at its strongest member; structural findings still add up.
const WEAK = new Set(checks.filter((c) => c.family === 'weak').map((c) => c.id));
function foldWeak(findings: Finding[]): Finding[] {
  const weak = findings.filter((f) => WEAK.has(f.check_id));
  if (weak.length < 2) return findings;
  const error = weak.find((f) => f.error_type)?.error_type;
  const merged: Finding = {
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
function triage(
  frame: Frame,
  frameBoxes: Box[],
  scored: Map<string, RiskResult>,
  { env_risk, model }: { env_risk?: number; model: boolean },
): FrameReport {
  const { tier: T, coverage: C, autoAccept } = POLICY;
  const drafts = frameBoxes.filter((b): b is DraftBox => b.state === 'draft');
  const greys = frameBoxes.filter(
    (b): b is GreyBox => b.state === 'grey' && b.confidence >= POLICY.greyFloor,
  );
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
  const flagged = frameBoxes.filter((b) => scored.get(b.id)!.score >= T.flagged);
  const blocking = flagged.filter((b) => b.group !== 'bonus');
  const high = blocking.filter((b) => scored.get(b.id)!.score >= T.high);
  const weak = drafts.filter((b) => b.group !== 'bonus' && b.confidence < autoAccept.minConfidence);
  const gates = {
    policy: !fired.some((r) => r.blocking) && !unsupported.length,
    risk: !blocking.length,
    confidence: !weak.length,
  };
  const tier: Tier =
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
