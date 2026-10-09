import { normalizeDataset } from '../schema/normalize.ts';
import temporalClass from './checks/temporal-class.ts';
import confidence from './checks/confidence.ts';
import bboxValidity from './checks/bbox-validity.ts';
import { areaCheck, positionCheck } from './checks/bbox-temporal.ts';
import { imageChecks, labelSizeStats } from './checks/image-quality.ts';
import type { Annotation } from '../schema/types.ts';
import type {
  AnalyzeOptions,
  CheckStat,
  ContextPosition,
  Evaluation,
  LegacyRiskReport,
  RiskResult,
  Severity,
} from '../risk/types.ts';
import type { LegacyCheck, LegacyContext } from './types.ts';

export const checks: LegacyCheck[] = [
  temporalClass,
  confidence,
  bboxValidity,
  areaCheck,
  positionCheck,
];
export const severity = (score: number): Severity =>
  score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
// 2.0.0 is the default so existing projects keep their scores and dataset fingerprints.
// New imports use LATEST_ENGINE_VERSION and the version is stored with the project.
export const ENGINE_VERSION = '2.0.0';
export const LATEST_ENGINE_VERSION = '2.1.0';
const PROFILES: Record<string, LegacyCheck[]> = {
  [ENGINE_VERSION]: checks,
  [LATEST_ENGINE_VERSION]: [...checks, ...imageChecks],
};
export function checksFor(version = ENGINE_VERSION) {
  if (!Object.hasOwn(PROFILES, version)) throw new Error(`Unknown engine version ${version}`);
  return PROFILES[version];
}

const POSITIONS: ContextPosition[] = ['previous', 'current', 'next'];

export function analyzeDataset(
  input: unknown,
  { minScore = 30, engineVersion = ENGINE_VERSION }: AnalyzeOptions = {},
): LegacyRiskReport {
  const active = checksFor(engineVersion);
  const data = normalizeDataset(input);
  const frames = new Map(data.frames.map((f) => [f.id, f]));
  const media = new Map(data.media.map((m) => [m.id, m]));
  const siblingsByFrame = new Map<string, Annotation[]>();
  for (const a of data.annotations) {
    if (!siblingsByFrame.has(a.frame_id)) siblingsByFrame.set(a.frame_id, []);
    siblingsByFrame.get(a.frame_id)!.push(a);
  }
  const stats = active === checks ? undefined : labelSizeStats(data.annotations, media, frames);
  const histories = new Map<string, Annotation[]>(),
    neighbors = new Map<string, { previous?: Annotation; next?: Annotation }>();
  for (const a of data.annotations) {
    if (a.track_id === undefined) continue;
    const key = JSON.stringify([frames.get(a.frame_id)!.media_id, a.track_id]);
    if (!histories.has(key)) histories.set(key, []);
    histories.get(key)!.push(a);
  }
  for (const history of histories.values()) {
    history.sort((a, b) => frames.get(a.frame_id)!.index - frames.get(b.frame_id)!.index);
    history.forEach((a, i) =>
      neighbors.set(a.id, { previous: history[i - 1], next: history[i + 1] }),
    );
  }
  const summary: Record<string, CheckStat> = Object.fromEntries(
    active.map((c) => [
      c.id,
      { version: c.version, passed: 0, flagged: 0, skipped: 0, skip_reasons: {} },
    ]),
  );
  const results = data.annotations.map((current): RiskResult => {
    const frame = frames.get(current.frame_id)!,
      m = media.get(frame.media_id)!;
    const context: LegacyContext = {
      current,
      ...neighbors.get(current.id),
      frames,
      media: m,
      siblings: siblingsByFrame.get(current.frame_id),
      stats,
    };
    const evaluations = active.map((check): Evaluation => {
      const result = check.run(context);
      const stat = summary[check.id];
      stat[result.status]++;
      if (result.status === 'skipped')
        stat.skip_reasons[result.reason] = (stat.skip_reasons[result.reason] || 0) + 1;
      return { check_id: check.id, check_version: check.version, ...result };
    });
    const findings = evaluations.filter((e) => e.status === 'flagged');
    const score = Math.min(
      100,
      findings.reduce((sum, f) => sum + f.score, 0),
    );
    return {
      id: current.id,
      dataset_id: data.dataset.id,
      reference: {
        annotation_id: current.id,
        frame_id: frame.id,
        frame_index: frame.index,
        media_id: m.id,
      },
      score,
      severity: severity(score),
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
  return {
    schema_version: '1.0.0',
    engine_version: engineVersion,
    dataset_id: data.dataset.id,
    min_score: minScore,
    checks: summary,
    results,
    cases: results
      .filter((r) => r.score >= minScore)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.reference.frame_index - b.reference.frame_index ||
          a.id.localeCompare(b.id),
      ),
  };
}
