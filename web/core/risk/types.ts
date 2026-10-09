import type { Annotation, BBox, Frame, Geometry, Media } from '../schema/types.ts';

export type Severity = 'high' | 'medium' | 'low';
// Free-form numbers and ids behind a finding; shown to reviewers as JSON.
export type Evidence = Record<string, any>;
export interface Skipped {
  status: 'skipped';
  reason: string;
}
export interface Passed {
  status: 'passed';
}
export interface Flagged {
  status: 'flagged';
  score: number;
  reason: string;
  evidence: Evidence;
  error_type?: string;
  suggested_label?: string;
}
export type CheckResult = Skipped | Passed | Flagged;
type Checked = { check_id: string; check_version: string };
export type Evaluation = CheckResult & Checked;
export type Finding = Flagged & Checked;
export interface CheckStat {
  version: string;
  passed: number;
  flagged: number;
  skipped: number;
  skip_reasons: Record<string, number>;
}

export type LabelGroup = 'core' | 'bonus' | 'other';
interface BoxBase {
  id: string;
  index: number;
  label: string;
  group: LabelGroup;
  confidence?: number;
}
// Non-bbox geometry: carried through so the frame can report it, never measured.
export interface UnsupportedBox extends BoxBase {
  state: 'unsupported';
  geometry: Geometry;
}
interface Measured extends BoxBase {
  geometry: BBox;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
  ratio: number;
}
export type DraftBox = Measured & { state: 'draft'; confidence: number };
export type GreyBox = Measured & { state: 'grey'; confidence: number };
export type ManualBox = Measured & { state: 'manual' };
export type UnusableBox = Measured & { state: 'invalid' | 'ignored' };
export type MeasuredBox = DraftBox | GreyBox | ManualBox | UnusableBox;
// Boxes that stand as labels: valid, large enough and not grey-zone.
export type LabelBox = DraftBox | ManualBox;
export type Box = UnsupportedBox | MeasuredBox;
export type BoxState = Box['state'];

export interface CheckContext {
  current: Annotation;
  previous?: Annotation;
  next?: Annotation;
  frames: Map<string, Frame>;
  frame: Frame;
  media: Media;
  box: Box;
  frameBoxes: Box[];
  env_risk?: number;
  // Filled in before relational checks run.
  peers: LabelBox[];
}
// What a check may rely on once temporalReady() has returned null.
export type TemporalContext = CheckContext & { previous: Annotation; next: Annotation };
export interface Check {
  id: string;
  version: string;
  relational?: boolean;
  family?: string;
  run(context: CheckContext): CheckResult;
}

export interface ImageRuleInput {
  drafts: DraftBox[];
  greys: GreyBox[];
  missing: GreyBox[];
  env_risk?: number;
}
export interface ImageRuleHit {
  reason: string;
  evidence: Evidence;
}
export interface ImageRule {
  id: string;
  blocking: boolean;
  run(input: ImageRuleInput): ImageRuleHit | null;
}

export type Tier = 'auto_accept' | 'verify' | 'relabel';
export interface FrameReport {
  frame_id: string;
  frame_index: number;
  media_id: string;
  tier: Tier;
  gates: { policy: boolean; risk: boolean; confidence: boolean };
  env_risk?: number;
  counts: Record<string, number>;
  image_rules: (ImageRuleHit & { rule_id: string; blocking: boolean })[];
  flagged: string[];
  advisory: string[];
  missing_candidates: string[];
  reason: string;
}
export type ContextPosition = 'previous' | 'current' | 'next';
export interface RiskResult {
  id: string;
  dataset_id: string;
  reference: { annotation_id: string; frame_id: string; frame_index: number; media_id: string };
  score: number;
  severity: Severity;
  state?: BoxState;
  group?: LabelGroup;
  suspected_error?: string;
  suggested_label?: string;
  reasons: string[];
  findings: Finding[];
  check_ids: string[];
  evaluations: Evaluation[];
  context: Partial<Record<ContextPosition, string>>;
}
// What every engine profile reports; the 2.x profiles in risk_v1 report nothing more.
export interface LegacyRiskReport {
  schema_version: '1.0.0';
  engine_version: string;
  dataset_id: string;
  min_score: number;
  checks: Record<string, CheckStat>;
  results: RiskResult[];
  cases: RiskResult[];
}
export interface RiskReport extends LegacyRiskReport {
  policy_version: string;
  image_rules: Record<string, { blocking: boolean; flagged: number }>;
  tiers: Record<string, number>;
  frames: FrameReport[];
  advisory_cases: RiskResult[];
}
export interface AnalyzeOptions {
  minScore?: number;
  engineVersion?: string;
}
