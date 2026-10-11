// The policy as data: one file per label, one per confusable pair, and the two shared files in
// policy/. Only rules with status "active" run; "manual" rules are carried for people to read.
// docs/policy-format.md describes the format.
import datasetFile from '../../policy/_dataset.json' with { type: 'json' };
import frameFile from '../../policy/_frame.json' with { type: 'json' };
import car from '../../policy/car.json' with { type: 'json' };
import truck from '../../policy/truck.json' with { type: 'json' };
import bus from '../../policy/bus.json' with { type: 'json' };
import motorcycle from '../../policy/motorcycle.json' with { type: 'json' };
import bicycle from '../../policy/bicycle.json' with { type: 'json' };
import person from '../../policy/person.json' with { type: 'json' };
import trafficLight from '../../policy/traffic_light.json' with { type: 'json' };
import trafficSign from '../../policy/traffic_sign.json' with { type: 'json' };
import barrier from '../../policy/barrier.json' with { type: 'json' };
import pole from '../../policy/pole.json' with { type: 'json' };
import carTruck from '../../policy/car_truck.json' with { type: 'json' };

type Params = Record<string, any>;
export interface PolicyRule {
  id: string;
  status: 'active' | 'proposed' | 'manual';
  template: string;
  check?: string | null;
  params?: Params;
  applies_to?: 'model' | 'human' | 'any';
  score?: number;
  error_type?: string;
  family?: string;
  level?: string;
  suggests?: string;
  unless?: Params[];
  replaces?: Params | Params[];
  text: string;
}
// A rule as the engine runs it: active, tied to a check, and scoped to one label ("*": any).
export type ActiveRule = PolicyRule & {
  check: string;
  params: Params;
  label: string;
  // Rules of a pair file: the other label of the pair, and what counts as a second opinion.
  rival?: string;
  opinion?: { min_overlap: number; min_rival_confidence: number };
};
// A project's change to the policy (docs/policy-format.md, section 6).
export type Patch =
  | { op: 'set'; rule: string; params?: Params; score?: number; from?: unknown }
  | { op: 'disable'; rule: string; from?: unknown }
  | { op: 'narrow'; rule: string; params: Record<string, { remove: string[] }>; from?: unknown }
  | { op: 'add'; label: string; rule: PolicyRule; from?: unknown };
interface LabelFile {
  label?: string;
  pair?: string[];
  second_opinion?: { params: ActiveRule['opinion'] };
  visibility?: Params;
  confirmability?: Params;
  rules: PolicyRule[];
}
type FrameRule = PolicyRule & { params: Params };
export interface Policy {
  labels: readonly string[];
  // Rules that become checks, in file order.
  boxRules: ActiveRule[];
  // Rules of template "waive": they score nothing and stand other checks down.
  waiveRules: ActiveRule[];
  frameRules: FrameRule[];
  missingCandidates: Params;
  // How visible an object of the label is, and what makes a box hard to confirm.
  visibilityOf(label: string): Params | undefined;
  confirmabilityOf(label: string): Params | undefined;
  // Below the minimum size of its label a box is neither right nor wrong.
  belowMinimum(label: string, width: number, height: number): boolean;
  // Visibility under which a box of the label is not judged when the dataset measured it.
  ignoredVisibility(label: string): number | undefined;
  // A label file that mentions a check owns it for that label: the shared rule stays out.
  ownsCheck(check: string, label: string): boolean;
  // A pair rule took this check over for boxes of these two labels.
  replaced(check: string, a: string, b: string): boolean;
}

// Every file wraps its content in a single `<name>_policy` key.
const unwrap = (file: object) => Object.values(file)[0] as LabelFile;
export const ANY_LABEL = '*';
const dataset = datasetFile.dataset_policy;
const labelFiles = [
  car,
  truck,
  bus,
  motorcycle,
  bicycle,
  person,
  trafficLight,
  trafficSign,
  barrier,
  pole,
].map(unwrap);
const pairFiles = [carTruck].map(unwrap);
const fail = (message: string): never => {
  throw new Error(`policy: ${message}`);
};
{
  const expected = [...dataset.labels].sort().join(),
    found = labelFiles
      .map((file) => file.label)
      .sort()
      .join();
  if (expected !== found) fail(`label files (${found}) differ from _dataset.json (${expected})`);
}

const isMinimum = (rule: PolicyRule) =>
  rule.template === 'min_size' && rule.params?.action === 'ignore';
// A rule of a pair file names the label it scores in its params: `label`, or for a rule about
// two boxes the label in `flag`.
function pairRule(file: LabelFile, rule: PolicyRule): ActiveRule {
  const pair = file.pair!,
    label = rule.params?.label ?? rule.params?.flag;
  if (!pair.includes(label)) fail(`rule "${rule.id}" names no label of its pair`);
  return {
    ...rule,
    params: rule.params ?? {},
    check: rule.check ?? rule.id,
    label,
    rival: pair.find((other) => other !== label),
    opinion: file.second_opinion?.params,
  };
}

function patched(rules: ActiveRule[], frameRules: FrameRule[], patches: Patch[]) {
  const all = (): (ActiveRule | FrameRule)[] => [...rules, ...frameRules];
  const find = (patch: Patch & { rule: string }) =>
    all().find((rule) => rule.id === patch.rule) ??
    fail(`patch "${patch.op}" names rule "${patch.rule}", which is not an active rule`);
  for (const patch of patches) {
    if (patch.op === 'add') {
      const { label, rule } = patch;
      if (all().some((r) => r.id === rule?.id)) fail(`patch adds rule "${rule.id}" twice`);
      if (label !== ANY_LABEL && !dataset.labels.includes(label))
        fail(`patch adds rule "${rule?.id}" to unknown label "${label}"`);
      if (!rule?.id || !rule.template || rule.template === 'manual')
        fail('a patch can only add a rule that has an id and a runnable template');
      rules.push({
        ...rule,
        status: 'active',
        params: rule.params ?? {},
        check: rule.check ?? rule.id,
        label,
      });
    } else if (patch.op === 'disable') {
      const rule = find(patch);
      if (rules.includes(rule as ActiveRule)) rules.splice(rules.indexOf(rule as ActiveRule), 1);
      else frameRules.splice(frameRules.indexOf(rule), 1);
    } else if (patch.op === 'set') {
      const rule = find(patch);
      if (patch.params) rule.params = { ...rule.params, ...patch.params };
      if (patch.score !== undefined) rule.score = patch.score;
    } else if (patch.op === 'narrow') {
      const rule = find(patch);
      for (const [key, { remove }] of Object.entries(patch.params)) {
        if (!Array.isArray(rule.params[key]))
          fail(`patch "narrow": "${key}" of rule "${rule.id}" is not a list`);
        rule.params = {
          ...rule.params,
          [key]: rule.params[key].filter((x: string) => !remove.includes(x)),
        };
      }
    } else fail(`patch op "${(patch as { op: string }).op}" does not exist`);
  }
}

export function loadPolicy(patches: Patch[] = []): Policy {
  const sources = [
    ...labelFiles.map((file) => ({
      rules: file.rules,
      scoped: (rule: PolicyRule): ActiveRule => ({
        ...rule,
        params: rule.params ?? {},
        check: rule.check ?? rule.id,
        label: file.label!,
      }),
    })),
    ...pairFiles.map((file) => ({
      rules: file.rules,
      scoped: (rule: PolicyRule) => pairRule(file, rule),
    })),
    {
      rules: dataset.rules as PolicyRule[],
      scoped: (rule: PolicyRule): ActiveRule => ({
        ...rule,
        params: rule.params ?? {},
        check: rule.check ?? rule.id,
        label: ANY_LABEL,
      }),
    },
  ];
  const seen = new Set<string>();
  for (const rule of [...sources.flatMap((s) => s.rules), ...frameFile.frame_policy.rules]) {
    if (seen.has(rule.id)) fail(`rule id "${rule.id}" is used twice`);
    seen.add(rule.id);
  }
  // Copies, so a patch never reaches the files or another project's policy.
  const rules = structuredClone(
    sources.flatMap(({ rules, scoped }) =>
      rules.filter((rule) => rule.status === 'active').map(scoped),
    ),
  );
  const frameRules = structuredClone(
    (frameFile.frame_policy.rules as PolicyRule[])
      .filter((rule) => rule.status === 'active')
      .map((rule) => ({ ...rule, params: rule.params ?? {} })),
  );
  patched(rules, frameRules, patches);
  // `suggests` may describe the suggestion in words; the engine can only pass on a label.
  for (const rule of rules) if (!dataset.labels.includes(rule.suggests!)) delete rule.suggests;

  const minimums = new Map(rules.filter(isMinimum).map((rule) => [rule.label, rule.params]));
  const hidden = new Map(
    rules
      .filter(
        (rule) =>
          rule.template === 'min_visibility' && rule.params.action_when_measured === 'ignore',
      )
      .map((rule) => [rule.label, rule.params.visibility_below as number]),
  );
  const owned = new Set(
    labelFiles.flatMap((file) =>
      file.rules.flatMap((rule) => (rule.check ? [`${rule.check} ${file.label}`] : [])),
    ),
  );
  const replaced = new Set(
    rules
      .flatMap((rule) => [rule.replaces ?? []].flat())
      .flatMap(({ check, for_pair: [a, b] }) => [`${check} ${a} ${b}`, `${check} ${b} ${a}`]),
  );
  const byLabel = new Map(labelFiles.map((file) => [file.label!, file]));
  return {
    labels: dataset.labels,
    boxRules: rules.filter((rule) => !isMinimum(rule) && rule.template !== 'waive'),
    waiveRules: rules.filter((rule) => rule.template === 'waive'),
    frameRules,
    missingCandidates: frameFile.frame_policy.missing_candidates,
    visibilityOf: (label) => byLabel.get(label)?.visibility,
    confirmabilityOf: (label) => byLabel.get(label)?.confirmability,
    belowMinimum(label, width, height) {
      const minimum = minimums.get(label);
      if (!minimum) return false;
      const side =
        minimum.side === 'height'
          ? height
          : minimum.side === 'width'
            ? width
            : Math.max(width, height);
      return side < minimum.px;
    },
    ignoredVisibility: (label) => hidden.get(label),
    ownsCheck: (check, label) => owned.has(`${check} ${label}`),
    replaced: (check, a, b) => replaced.has(`${check} ${a} ${b}`),
  };
}
