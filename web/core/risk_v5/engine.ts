import { normalizeDataset } from '../schema/normalize.ts';
import { POLICY, POLICY_VERSION, canonicalLabel, labelGroup } from './policy.ts';
import { loadPolicy } from './rules.ts';
import { measuredVisibility } from './visibility.ts';
import { isLabel, skip } from './checks/shared.ts';
import { buildChecks } from './checks/index.ts';
import { secondOpinion } from './checks/templates.ts';
import { buildImageRules, missingIn } from './image-rules.ts';
import type { Patch, Policy } from './rules.ts';
import type { StaticContext } from './checks/shared.ts';
import type { Annotation, Frame } from '../schema/types.ts';
import type {
  Box,
  CheckContext,
  CheckResult,
  CheckStat,
  ContextPosition,
  DraftBox,
  Evaluation,
  Finding,
  Flagged,
  FrameReport,
  GreyBox,
  RiskReport,
  RiskResult,
  Severity,
  Tier,
} from './types.ts';

// risk_v5 is the 5.0.0 snapshot of the engine, with the policy it read (policy 3.0.0, in
// ./policy): the last one that kept motorcycle and bicycle apart. Projects imported under 5.0.0
// keep running here, so their scores never change.
// Everything the engine runs is built from the active rules in ./policy (rules.ts), once for the
// policy as written and once more for each project that patches it.
function compile(patches: Patch[] = []) {
  const policy = loadPolicy(patches);
  const checks = buildChecks(policy);
  const ids = new Set(checks.map((c) => c.id));
  for (const rule of policy.waiveRules)
    for (const id of rule.params.waives ?? [])
      if (!ids.has(id)) throw new Error(`policy: rule "${rule.id}" waives unknown check "${id}"`);
  return {
    policy,
    checks,
    imageRules: buildImageRules(policy),
    // A low score, a frame cut and a poor image all describe one thing, a weak box.
    weak: new Set(checks.filter((c) => c.family === 'weak').map((c) => c.id)),
  };
}
type Engine = ReturnType<typeof compile>;
const builtIn = compile();
export const { checks, imageRules } = builtIn;
export const severity = (score: number): Severity =>
  score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
export const ENGINE_VERSION = '5.0.0';

// draft: model box at or above the working score. manual: no score, drawn by a person.
// grey: below the working score, a hint of a missed object rather than a label.
// ignored: below the minimum size of its label, or measured by the dataset as all but hidden:
// neither right nor wrong.
function describe(annotation: Annotation, index: number, policy: Policy): Box {
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
  if (g.width <= 0 || g.height <= 0) return { ...measured, state: 'invalid' };
  if (policy.belowMinimum(label, g.width, g.height)) return { ...measured, state: 'ignored' };
  const visibility = policy.visibilityOf(label),
    hidden = policy.ignoredVisibility(label);
  if (visibility && hidden !== undefined) {
    const seen = measuredVisibility(annotation, visibility);
    if (seen !== null && seen < hidden) return { ...measured, state: 'ignored' };
  }
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

export function analyzeDataset(
  input: unknown,
  {
    minScore = 30,
    waivers = {},
    patches = [],
  }: { minScore?: number; waivers?: Record<string, string[]>; patches?: Patch[] } = {},
): RiskReport {
  const engine = patches.length ? compile(patches) : builtIn;
  const { policy, checks, imageRules } = engine;
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
    byFrame.get(a.frame_id)!.push(describe(a, index, policy));
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
  // Model output and hand-drawn boxes rarely share one attribute schema, so what "the dataset
  // carries" is asked of each kind apart.
  const scoredBox = (a: Annotation) => Number.isFinite(a.confidence);
  const namesOf = (model: boolean) =>
    new Set(
      data.annotations
        .filter((a) => scoredBox(a) === model)
        .flatMap((a) => Object.keys(a.attributes ?? {})),
    );
  const attributeNames = { model: namesOf(true), human: namesOf(false) };
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
      attributeNames: attributeNames[scoredBox(current) ? 'model' : 'human'],
    };
  });
  // A box suspected of being no object at all cannot serve as evidence against another box,
  // so rules that look at other boxes run after the suspects are known.
  const outcomes = new Map(contexts.map((c) => [c.current.id, new Map<string, CheckResult>()]));
  // A project's guideline can outrank the policy: where a person chose a guideline rule that
  // permits what a check flags, that check does not run on boxes of the rule's classes.
  const waived = (check: string, label: string) =>
    waivers[check]?.some((l) => l === '*' || l === label) ?? false;
  // The policy can stand its own checks down too: a rule of template "waive" does so for a
  // model draft whose second opinion is the label the rule names.
  const stoodDown = new Map<string, Set<string>>();
  const policyWaived = (context: CheckContext, check: string) => {
    const { box } = context;
    if (box.state !== 'draft' || !policy.waiveRules.length) return false;
    if (!stoodDown.has(box.id)) {
      const draft = context as unknown as StaticContext<DraftBox>;
      stoodDown.set(
        box.id,
        new Set(
          policy.waiveRules
            .filter(
              (rule) =>
                rule.label === box.label &&
                secondOpinion(rule, draft)?.label === rule.params.when_second_opinion_is,
            )
            .flatMap((rule) => rule.params.waives as string[]),
        ),
      );
    }
    return stoodDown.get(box.id)!.has(check);
  };
  const run = (relational: boolean) => {
    for (const context of contexts)
      for (const check of checks)
        if (!!check.relational === relational)
          outcomes
            .get(context.current.id)!
            .set(
              check.id,
              waived(check.id, context.box.label)
                ? skip('guideline_waived')
                : policyWaived(context, check.id)
                  ? skip('policy_waived')
                  : check.run(context),
            );
  };
  run(false);
  const suspects = new Set(
    contexts
      .filter((c) => {
        const flagged = [...outcomes.get(c.current.id)!.values()].filter(
          (r): r is Flagged => r.status === 'flagged' && r.level !== 'warning',
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
    const findings = foldWeak(
      evaluations.filter((e) => e.status === 'flagged'),
      engine.weak,
    );
    // A warning is shown to the reviewer but neither scores the box nor names its error.
    const counted = findings.filter((f) => f.level !== 'warning');
    const score = Math.min(
      100,
      counted.reduce((sum, f) => sum + f.score, 0),
    );
    const suspicion = leading(counted);
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
    triage(engine, frame, byFrame.get(frame.id)!, scored, {
      env_risk: frameRisk(frame),
      model:
        hasScores || (media.get(frame.media_id)!.source || data.dataset.source)?.kind === 'model',
    }),
  );
  return {
    schema_version: '1.0.0',
    engine_version: ENGINE_VERSION,
    policy_version: POLICY_VERSION,
    ...(Object.keys(waivers).length > 0 && { waivers }),
    ...(patches.length > 0 && { patches }),
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
    cases: queue(results.filter((r) => r.score >= minScore && !advisoryOnly(r.group))),
    advisory_cases: queue(results.filter((r) => r.score >= minScore && advisoryOnly(r.group))),
    warning_cases: queue(
      results.filter((r) => r.score < minScore && r.findings.some((f) => f.level === 'warning')),
    ),
  };
}
// A flagged box of a bonus label is a concrete error like any other; whether it joins the main
// queue and blocks its frame, or is only listed, is the policy's choice (_dataset.json).
const advisoryOnly = (group?: string) => group === 'bonus' && !POLICY.bonusBoxesQueue;
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
function foldWeak(findings: Finding[], family: Set<string>): Finding[] {
  const weak = findings.filter((f) => family.has(f.check_id) && f.level !== 'warning');
  if (weak.length < 2) return findings;
  const named = weak.find((f) => f.error_type);
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
    ...(named && { error_type: named.error_type }),
    ...(named?.suggested_label && { suggested_label: named.suggested_label }),
  };
  return findings.flatMap((f) => (f === weak[0] ? [merged] : weak.includes(f) ? [] : [f]));
}

// The tier is decided here, with no reviewer in the loop: a frame is auto-accepted only when
// the policy gate (frame rules), the risk gate (box priority) and the confidence gate all hold.
function triage(
  { policy, imageRules }: Engine,
  frame: Frame,
  frameBoxes: Box[],
  scored: Map<string, RiskResult>,
  { env_risk, model }: { env_risk?: number; model: boolean },
): FrameReport {
  const { tier: T, autoAccept } = POLICY;
  const drafts = frameBoxes.filter((b): b is DraftBox => b.state === 'draft');
  const greys = frameBoxes.filter(
    (b): b is GreyBox => b.state === 'grey' && b.confidence >= POLICY.greyFloor,
  );
  const missing = missingIn(policy, greys, drafts);
  // Coverage rules describe model output; a frame labelled only by people has none to judge.
  const fired = model
    ? imageRules.flatMap((r) => {
        const hit = r.run({ drafts, greys, missing, env_risk });
        return hit ? [{ rule_id: r.id, blocking: r.blocking, ...hit }] : [];
      })
    : [];
  const unsupported = frameBoxes.filter((b) => b.state === 'unsupported');
  const flagged = frameBoxes.filter((b) => scored.get(b.id)!.score >= T.flagged);
  const blocking = flagged.filter((b) => !advisoryOnly(b.group));
  // Redrawing a whole frame is decided by its core boxes; a wrong bonus box is fixed on its own.
  const core = blocking.filter((b) => b.group !== 'bonus');
  const high = core.filter((b) => scored.get(b.id)!.score >= T.high);
  const weak = drafts.filter((b) => b.group !== 'bonus' && b.confidence < autoAccept.minConfidence);
  const gates = {
    policy: !fired.some((r) => r.blocking) && !unsupported.length,
    risk: !blocking.length,
    confidence: !weak.length,
  };
  const tier: Tier =
    core.length >= T.relabelFlagged || high.length >= T.relabelHigh
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
    advisory: flagged.filter((b) => advisoryOnly(b.group)).map((b) => b.id),
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
