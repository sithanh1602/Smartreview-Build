import { iou } from './checks/shared.ts';
import { canonicalLabel } from './policy.ts';
import type { Policy, PolicyRule } from './rules.ts';
import type { DraftBox, GreyBox, ImageRule, ImageRuleHit, MeasuredBox } from './types.ts';

// Frame rules score no box: they keep the whole frame out of auto_accept. Rules about bonus
// labels are reported but do not block. The rules and their numbers are policy/_frame.json.
type FrameRule = PolicyRule & { params: Record<string, any> };
type Limits = {
  min_confidence?: number;
  min_long_side_px?: number;
  max_overlap_with_any_draft?: number;
};
// A grey box that is confident, large and away from every draft hints at a missed object.
const standsAlone = (box: GreyBox, drafts: DraftBox[], limits: Limits) =>
  box.confidence >= (limits.min_confidence ?? 0) &&
  Math.max(box.width, box.height) >= (limits.min_long_side_px ?? 0) &&
  drafts.every(
    (d) => iou(box.geometry, d.geometry) < (limits.max_overlap_with_any_draft ?? Infinity),
  );
export const missingIn = (policy: Policy, greys: GreyBox[], drafts: DraftBox[]) =>
  greys.filter((box) => standsAlone(box, drafts, policy.missingCandidates));

// What a reviewer reads, and the name the count has in the evidence, per rule. A rule without
// wording here shows its own text.
const WORDING: Record<string, { key: string; reason?: (n: number) => string }> = {
  'coverage.no_draft_box': { key: 'drafts' },
  'coverage.night_grey': { key: 'grey_boxes', reason: (n) => `Ảnh tối có ${n} box vùng xám.` },
  'coverage.bus_present': { key: 'bus_boxes', reason: () => 'Ảnh có xe buýt.' },
  'coverage.grey_vehicles': {
    key: 'grey_boxes',
    reason: (n) => `${n} box vùng xám lớp xe: nghi sót nhiều xe.`,
  },
  'coverage.dense_traffic': { key: 'vehicle_boxes', reason: (n) => `Xe dày đặc: ${n} box.` },
  'coverage.grey_person': { key: 'grey_boxes', reason: () => 'Có dấu hiệu một người bị sót.' },
  'coverage.crowd': { key: 'person_boxes', reason: (n) => `Đám đông: ${n} box người.` },
  'coverage.many_lights': {
    key: 'light_boxes',
    reason: (n) => `Quá nhiều đèn tín hiệu: ${n} box.`,
  },
  'coverage.model_missing': { key: 'missing' },
  'coverage.many_stop_signs': {
    key: 'sign_boxes',
    reason: (n) => `Quá nhiều biển stop: ${n} box.`,
  },
};
const OPS: Record<string, (n: number, value: number) => boolean> = {
  '>=': (n, value) => n >= value,
  '>': (n, value) => n > value,
  '==': (n, value) => n === value,
};
const say = (rule: FrameRule, n: number, evidence: object): ImageRuleHit => ({
  reason: WORDING[rule.id]?.reason?.(n) ?? rule.text,
  evidence,
});
const TEMPLATES: Record<string, (rule: FrameRule) => ImageRule['run']> = {
  frame_count: (rule) => {
    const { labels, state, op, value } = rule.params,
      key = WORDING[rule.id]?.key ?? 'boxes';
    return ({ drafts, greys }) => {
      const boxes: MeasuredBox[] =
        state === 'grey' ? greys.filter((b) => standsAlone(b, drafts, rule.params)) : drafts;
      const n =
        labels === 'any' ? boxes.length : boxes.filter((b) => labels.includes(b.label)).length;
      // A rule that fires on the first box has no threshold worth showing.
      const threshold = op === '>=' && value === 1 ? undefined : value;
      return OPS[op](n, value) ? say(rule, n, { [key]: n, ...(threshold && { threshold }) }) : null;
    };
  },
  // Objects the model found that no drawn box covers (ai-service/score_boxes.py), of the rule's
  // labels and at its confidence or above. They come with the import, so the rule runs on frames
  // labelled by people too. An object that a flagged box of its label already overlaps
  // (`skip_near_flagged_iou`) is that box drawn in the wrong place, which its own case reports.
  model_missing: (rule) => {
    const { labels, min_confidence = 0, skip_near_flagged_iou: near = Infinity } = rule.params;
    return ({ hints = [], flagged = [], model_confidence }) => {
      // Hints already end at the scoring model's own floor; judging them on a higher policy
      // number would silently drop what the model was set to report.
      const floor = model_confidence ?? min_confidence;
      const objects = hints
        .map((h) => ({ ...h, label: canonicalLabel(h.label) }))
        .filter((h) => h.confidence >= floor && labels.includes(h.label))
        .filter(
          (h) => !flagged.some((b) => b.label === h.label && iou(b.geometry, h.geometry) >= near),
        )
        .sort((a, b) => b.confidence - a.confidence);
      if (!objects.length) return null;
      const named = objects
        .map((h) => `${h.label} ${h.confidence.toFixed(2).replace('.', ',')}`)
        .join(', ');
      return {
        reason: `Model thấy ${objects.length} vật chưa có box: ${named}.`,
        evidence: { missing: objects.length, objects },
      };
    };
  },
  frame_condition: (rule) => {
    const { env_risk_min, grey_boxes_over, grey_min_confidence = 0 } = rule.params,
      key = WORDING[rule.id]?.key ?? 'boxes';
    return ({ greys, env_risk }) => {
      const n = greys.filter((b) => b.confidence >= grey_min_confidence).length;
      return env_risk !== undefined && env_risk >= env_risk_min && n > grey_boxes_over
        ? say(rule, n, { env_risk, [key]: n, threshold: grey_boxes_over })
        : null;
    };
  },
};
const fail = (rule: FrameRule, message: string): never => {
  throw new Error(`policy: rule "${rule.id}": ${message}`);
};
export const buildImageRules = (policy: Policy): ImageRule[] =>
  policy.frameRules.map((rule) => {
    const template = TEMPLATES[rule.template];
    if (!template) return fail(rule, `template "${rule.template}" is not implemented`);
    const { op, state, blocking } = rule.params;
    if (rule.template === 'frame_count' && (!OPS[op] || !['draft', 'grey'].includes(state)))
      return fail(rule, `op "${op}" or state "${state}" is not supported`);
    return {
      id: rule.id,
      blocking: blocking !== false,
      needsModel: rule.template !== 'model_missing',
      run: template(rule),
    };
  });
