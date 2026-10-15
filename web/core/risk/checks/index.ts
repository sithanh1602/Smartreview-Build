import { ANY_LABEL } from '../rules.ts';
import { visibilityOf } from '../visibility.ts';
import { TEMPLATES } from './templates.ts';
import { UNAVAILABLE, skip, pass } from './shared.ts';
import type { ActiveRule, Policy } from '../rules.ts';
import type { Check, CheckContext } from '../types.ts';

// A check is the engine's name for what one or more policy rules look for: reports, waivers and
// reviewers refer to the check id, and each label brings its own rule (score, thresholds) to it.
// The order below is the order of evaluations in a report, and it breaks ties between findings
// of equal score. The version changes when a check starts judging differently.
const CHECKS: [id: string, version?: string][] = [
  ['temporal.class_inconsistency'],
  ['confidence.neighbor_drop'],
  ['geometry.bbox_area'],
  ['geometry.bbox_position'],
  ['confidence.low_score'],
  ['confidence.rescore_low'],
  ['confidence.class_margin'],
  ['confidence.vehicle_confusion'],
  ['confidence.person_vs_two_wheeler'],
  ['geometry.bbox_validity'],
  ['geometry.cross_class_overlap'],
  ['geometry.edge_truncated', '2.0.0'],
  ['env.poor_condition'],
  ['geometry.manual_overlap'],
  ['context.vehicle_in_large_vehicle'],
  ['context.ego_vehicle'],
  ['geometry.vehicle_position', '2.0.0'],
  ['geometry.vehicle_aspect'],
  ['geometry.two_wheeler_aspect'],
  ['context.person_in_vehicle', '2.0.0'],
  ['context.person_two_wheeler'],
  ['geometry.person_aspect'],
  ['context.light_in_vehicle'],
  ['geometry.light_position'],
  ['geometry.light_below_vehicles'],
  ['geometry.light_aspect', '2.0.0'],
  ['geometry.light_overlap', '2.0.0'],
  ['context.sign_in_vehicle'],
  ['geometry.stop_sign_aspect'],
  ['geometry.sign_position'],
  ['geometry.sign_overlap'],
  ['geometry.barrier_aspect'],
  ['context.barrier_spans_vehicle'],
  ['geometry.pole_aspect'],
  ['context.pole_covers_objects'],
  ['geometry.duplicate_draft'],
  ['geometry.stronger_duplicate'],
  ['visibility.mostly_hidden'],
  ['visibility.barely_visible'],
  ['attribute.required'],
  ['attribute.truncated_edge'],
  ['pair.same_place'],
  ['pair.second_opinion_margin'],
  ['pair.unsupported_name'],
  ['pair.relative_size'],
];

const groupBy = (rules: ActiveRule[], key: 'label' | 'check') => {
  const groups = new Map<string, ActiveRule[]>();
  for (const rule of rules) groups.set(rule[key], [...(groups.get(rule[key]) ?? []), rule]);
  return groups;
};
const fail = (rule: ActiveRule, message: string): never => {
  throw new Error(`policy: rule "${rule.id}": ${message}`);
};
// An active rule the engine cannot run exactly as written is an error, never a silent no-op.
function templateOf(rule: ActiveRule) {
  const template = TEMPLATES[rule.template];
  if (!template) return fail(rule, `template "${rule.template}" is not implemented`);
  const unsupported = template.unsupported?.(rule);
  if (unsupported) return fail(rule, unsupported);
  if (template.modelOnly?.(rule) && rule.applies_to !== 'model')
    return fail(rule, 'needs a confidence, so applies_to must be "model"');
  const steps: { score?: unknown }[] | undefined = rule.params.score_by_margin;
  if (steps ? steps.some((s) => typeof s.score !== 'number') : typeof rule.score !== 'number')
    return fail(rule, 'has no score');
  for (const condition of rule.unless ?? [])
    if (!('attribute' in condition) && !('visibility_below' in condition))
      return fail(rule, `unless condition ${JSON.stringify(condition)} is not supported`);
  return template;
}
const one = <T>(rule: ActiveRule, what: string, values: T[]) =>
  new Set(values).size === 1 ? values[0] : fail(rule, `rules of one check differ in ${what}`);
const needsVisibility = (rule: ActiveRule) =>
  !!rule.unless?.some((condition) => 'visibility_below' in condition);

function build(id: string, version: string, rules: ActiveRule[], policy: Policy): Check {
  const templates = rules.map(templateOf);
  const scope = one(
    rules[0],
    'scope',
    templates.map((t) => t.scope),
  );
  const family = one(
    rules[0],
    'family',
    rules.map((r) => r.family),
  );
  const byLabel = groupBy(rules, 'label');
  // `unless`: the rule says nothing about a box in this condition, for instance a shape rule on
  // an object that is mostly hidden.
  const excepted = (rule: ActiveRule, context: CheckContext) =>
    !!rule.unless?.some((condition) => {
      if ('attribute' in condition)
        return context.current.attributes?.[condition.attribute] === condition.equals;
      const seen = visibilityOf(context, policy.visibilityOf(context.box.label));
      return !!seen && seen.value < condition.visibility_below;
    });
  return {
    id,
    version,
    // Other boxes decide how much of an object is hidden, so such a rule waits for them too.
    relational: rules.some((rule, i) => templates[i].relational?.(rule) || needsVisibility(rule)),
    family,
    run(context) {
      const { box } = context;
      const unavailable = scope === 'box' && UNAVAILABLE[box.state];
      if (unavailable) return skip(unavailable);
      const own =
        byLabel.get(box.label) ??
        (policy.ownsCheck(id, box.label) ? undefined : byLabel.get(ANY_LABEL));
      if (!own) return skip('unsupported_label');
      // applies_to narrows a rule to model drafts or to boxes drawn by a person.
      const fitting =
        scope === 'box'
          ? own.filter(({ applies_to }) =>
              applies_to === 'model'
                ? box.state === 'draft'
                : applies_to === 'human'
                  ? box.state === 'manual'
                  : true,
            )
          : own;
      if (!fitting.length)
        return skip(own[0].applies_to === 'model' ? 'missing_confidence' : 'not_manual');
      const usable = fitting.filter((rule) => !excepted(rule, context));
      if (!usable.length) return skip('excepted');
      for (const rule of usable) {
        const result = TEMPLATES[rule.template].test(rule, context, policy);
        if (result) return result.status === 'flagged' ? { ...result, rule_id: rule.id } : result;
      }
      return pass();
    },
  };
}

export function buildChecks(policy: Policy): Check[] {
  const byCheck = groupBy(policy.boxRules, 'check');
  const known = new Map(CHECKS.map(([id, version = '1.0.0']) => [id, version]));
  return [
    ...CHECKS.map(([id]) => id).filter((id) => byCheck.has(id)),
    ...[...byCheck.keys()].filter((id) => !known.has(id)),
  ].map((id) => build(id, known.get(id) ?? '1.0.0', byCheck.get(id)!, policy));
}
