// The values live in policy/_dataset.json; this module only gives them names. Rules and their
// thresholds are read from the label files by rules.ts.
import datasetFile from '../../policy/_dataset.json' with { type: 'json' };
import type { LabelGroup } from './types.ts';

const { policy_version, thresholds, tiers, auto_accept, groups, aliases, merged_labels } =
  datasetFile.dataset_policy;

export const POLICY_VERSION = policy_version;
export const POLICY = Object.freeze({
  workingScore: thresholds.working_score,
  greyFloor: thresholds.grey_floor,
  lowScore: thresholds.low_score,
  classMargin: thresholds.class_margin,
  confusionMargin: thresholds.confusion_margin,
  containment: thresholds.containment,
  duplicateIou: thresholds.duplicate_iou,
  edgePx: thresholds.edge_px,
  poorEnv: thresholds.poor_env,
  tier: Object.freeze({
    flagged: tiers.flagged,
    high: tiers.high,
    relabelFlagged: tiers.relabel_flagged,
    relabelHigh: tiers.relabel_high,
  }),
  // A flagged box of a bonus label joins the main queue and blocks its frame, or is only listed.
  bonusBoxesQueue: groups.flagged_bonus_boxes === 'queue',
  // Inert at the working score; raise it once shadow runs give a measured floor.
  autoAccept: Object.freeze({ minConfidence: auto_accept.min_confidence }),
});

// Label sets the builtin checks reason with; a builtin keeps its logic in code.
export const FOUR_WHEEL = ['car', 'truck', 'bus'];
export const TWO_WHEEL = ['two_wheeler'];
export const VEHICLES = [...FOUR_WHEEL, ...TWO_WHEEL];
// A missed object of a core label blocks its frame; bonus labels are too poorly drafted for that.
export const CORE_LABELS: readonly string[] = groups.core;
export const BONUS_LABELS: readonly string[] = groups.bonus;
const ALIASES: Record<string, string> = aliases;
export function canonicalLabel(label: string) {
  const key = label
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return ALIASES[key] || key;
}
// A label the policy merged into another is renamed when a dataset is imported, so what is
// stored and exported carries the one name. Other aliases are spellings and stay as written.
const MERGED = new Set(Object.keys(merged_labels).filter((label) => label !== 'note'));
export function mergeLabels<T extends { annotations: { label: string }[] }>(data: T): T {
  for (const annotation of data.annotations) {
    const label = canonicalLabel(annotation.label);
    if (MERGED.has(label)) annotation.label = label;
  }
  return data;
}
// Labels outside the policy have no label rules, so they stay blocking like core labels.
export const labelGroup = (label: string): LabelGroup =>
  CORE_LABELS.includes(label) ? 'core' : BONUS_LABELS.includes(label) ? 'bonus' : 'other';
