import { BONUS_LABELS, CORE_LABELS, canonicalLabel } from '../core/risk/policy.ts';
import type { Patch } from '../core/risk/rules.ts';

// What a guideline adds to a project beyond waivers (guideline-waivers.ts): rules that are new
// or stricter than the policy, run as checks through policy patches; captions that describe a
// label to the label verifier the way the guideline defines it; and the rules themselves, kept
// with the project for the dashboard and the reviewer. All of it comes from the rules.json a
// browser sent, so nothing in it is trusted beyond its shape.

// The templates (core/risk/checks/templates.ts) a person can turn a guideline rule into. Each
// asks only for numbers a guideline states; the rest of the template is fixed here.
export type RunTemplate =
  | 'min_size'
  | 'aspect_ratio'
  | 'position_band'
  | 'required_attribute'
  | 'required_track'
  | 'low_confidence'
  | 'score_range'
  | 'max_gap';
export interface RunField {
  key: string;
  label: string;
  kind: 'number' | 'list' | 'choice';
  options?: [string, string][];
  min?: number;
  max?: number;
  optional?: boolean;
}
export const RUN_TEMPLATES: Record<
  RunTemplate,
  {
    name: string;
    quantities: string[];
    error: string;
    fields: RunField[];
    // Params of the template a guideline does not choose.
    fixed?: Record<string, unknown>;
    model?: boolean;
  }
> = {
  min_size: {
    name: 'Cạnh box nhỏ hơn ngưỡng',
    quantities: ['box.size'],
    error: 'BBOX',
    // "ignore" is the policy's size table, a box state rather than a finding.
    fixed: { action: 'flag' },
    fields: [
      {
        key: 'side',
        label: 'Cạnh',
        kind: 'choice',
        options: [
          ['long', 'Cạnh dài'],
          ['width', 'Chiều rộng'],
          ['height', 'Chiều cao'],
        ],
      },
      { key: 'px', label: 'Ngưỡng (px)', kind: 'number', min: 1 },
    ],
  },
  aspect_ratio: {
    name: 'Tỉ lệ cao/rộng ngoài khoảng',
    quantities: ['box.aspect_ratio'],
    error: 'BBOX',
    fields: [
      { key: 'min', label: 'Tối thiểu', kind: 'number', min: 0, optional: true },
      { key: 'max', label: 'Tối đa', kind: 'number', min: 0, optional: true },
    ],
  },
  position_band: {
    name: 'Vị trí theo chiều dọc ảnh',
    quantities: ['box.position'],
    error: 'BBOX',
    fields: [
      {
        key: 'anchor',
        label: 'Điểm neo',
        kind: 'choice',
        options: [
          ['center', 'Tâm box'],
          ['top', 'Mép trên'],
          ['bottom', 'Mép dưới'],
        ],
      },
      { key: 'min_y', label: 'Từ (0 = đỉnh ảnh)', kind: 'number', min: 0, max: 1, optional: true },
      { key: 'max_y', label: 'Đến (1 = đáy ảnh)', kind: 'number', min: 0, max: 1, optional: true },
    ],
  },
  required_attribute: {
    name: 'Thiếu attribute hoặc giá trị không hợp lệ',
    quantities: ['box.attribute'],
    error: 'ATTRIBUTE',
    fields: [
      { key: 'names', label: 'Tên attribute', kind: 'list' },
      { key: 'values', label: 'Giá trị hợp lệ', kind: 'list', optional: true },
    ],
  },
  required_track: {
    name: 'Box thiếu track_id',
    quantities: ['box.track_id'],
    error: 'TRACK',
    fields: [],
  },
  low_confidence: {
    name: 'Confidence của model dưới ngưỡng',
    quantities: ['box.confidence'],
    error: 'CLASS',
    fields: [{ key: 'below', label: 'Ngưỡng (0–1)', kind: 'number', min: 0, max: 1 }],
    model: true,
  },
  // Either way and on either score, for any box that has it (a person's box has a rescore).
  score_range: {
    name: 'Điểm của box ngoài khoảng cho phép',
    quantities: ['box.rescore'],
    error: 'CLASS',
    fields: [
      {
        key: 'source',
        label: 'Điểm',
        kind: 'choice',
        options: [
          ['rescore', 'Rescore (model chấm lại box)'],
          ['confidence', 'Confidence của model'],
        ],
      },
      { key: 'above', label: 'Gắn cờ khi lớn hơn', kind: 'number', min: 0, max: 1, optional: true },
      { key: 'below', label: 'Gắn cờ khi nhỏ hơn', kind: 'number', min: 0, max: 1, optional: true },
    ],
  },
  max_gap: {
    name: 'Track biến mất quá số frame',
    quantities: ['track.frame_gap'],
    error: 'TRACK',
    fields: [{ key: 'frames', label: 'Số frame tối đa', kind: 'number', min: 0 }],
  },
};
// Points a rule run from a guideline adds to a box: the score at which a box enters the queue.
export const RUN_SCORE = 30;

export interface RunSpec {
  template: RunTemplate;
  params: Record<string, unknown>;
  score: number;
}
// The fields of a rule draft (server/guideline/model-call.ts) this module reads.
export interface GuidelineRule {
  id: string;
  section: string;
  quote: string;
  kind: 'check' | 'reviewer' | 'definition';
  classes: string[];
  condition: string;
  quantities: string[];
  verdict: 'flag' | 'accept' | 'none';
  relation: 'new' | 'stricter' | 'looser';
  needs?: string[];
}
type Attributes = { name: string; attributes: { name: string; values: string[] }[] }[];

export const POLICY_LABELS: readonly string[] = [...CORE_LABELS, ...BONUS_LABELS];
const RULE_ID = /^[A-Za-z0-9_-]{1,24}$/;
const isRule = (rule: unknown): rule is GuidelineRule =>
  !!rule &&
  typeof rule === 'object' &&
  typeof (rule as GuidelineRule).id === 'string' &&
  RULE_ID.test((rule as GuidelineRule).id);
const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

// Only a rule that flags something the policy lets through, or flags it sooner, can add a check.
export const runnable = (rule: Pick<GuidelineRule, 'kind' | 'verdict' | 'relation'>) =>
  rule.kind === 'check' && rule.verdict === 'flag' && rule.relation !== 'looser';

// The labels of the policy a rule speaks of; "*" for every label.
export function ruleLabels(classes: unknown): string[] {
  const labels = strings(classes).map((c) => (c.trim() === '*' ? '*' : canonicalLabel(c)));
  if (labels.includes('*')) return ['*'];
  return [...new Set(labels.filter((l) => POLICY_LABELS.includes(l)))];
}

const numbers = (condition: string) =>
  [...condition.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(',', '.')));
const share = (n: number | undefined) => (n === undefined ? undefined : n > 1 ? n / 100 : n);
// Which way a rule's condition (worded as what gets flagged) bounds its number: "lớn hơn 0.3"
// flags above, "dưới 40%" below. The lower-side words are looked for first, so "<" wins over
// "<=" reading as both.
export function directionOf(condition: string): 'above' | 'below' | null {
  const c = condition.toLowerCase();
  if (/nhỏ hơn|bé hơn|thấp hơn|dưới|kém hơn|ít hơn|<|below|less|lower|under/.test(c))
    return 'below';
  if (/lớn hơn|cao hơn|nhiều hơn|trên|vượt|quá|>|above|greater|higher|more|over/.test(c))
    return 'above';
  return null;
}
// Which score a rule speaks of: the rescore of a box, or a model's own confidence.
const scoreOf = (rule: Pick<GuidelineRule, 'quantities' | 'condition'>) =>
  rule.quantities.includes('box.rescore') || /rescore/i.test(rule.condition)
    ? 'rescore'
    : rule.quantities.includes('box.confidence') || /confidence|độ tin cậy/i.test(rule.condition)
      ? 'confidence'
      : null;
// A first guess at how to run a rule, from the quantities the model named and the numbers in
// its condition. A person checks it before it counts.
export function guessRun(rule: GuidelineRule, classes: Attributes = []): RunSpec | null {
  // A bound on a score: low_confidence only flags a draft's confidence below its number, so a
  // rescore, or a confidence above a number, runs as score_range in the condition's direction.
  const score = scoreOf(rule),
    direction = directionOf(rule.condition);
  if (score === 'rescore' || (score === 'confidence' && direction === 'above')) {
    const bound = share(numbers(rule.condition)[0]);
    return {
      template: 'score_range',
      params: { source: score, [direction ?? 'below']: bound },
      score: RUN_SCORE,
    };
  }
  const template = (Object.keys(RUN_TEMPLATES) as RunTemplate[]).find((t) =>
    RUN_TEMPLATES[t].quantities.some((q) => rule.quantities.includes(q)),
  );
  if (!template) return null;
  const found = numbers(rule.condition),
    condition = rule.condition.toLowerCase();
  const params: Record<string, unknown> = {};
  if (template === 'min_size') {
    params.side = /chiều cao|cao/.test(condition)
      ? 'height'
      : /chiều rộng|rộng/.test(condition)
        ? 'width'
        : 'long';
    params.px = found[0];
  } else if (template === 'aspect_ratio') {
    if (found.length >= 2) [params.min, params.max] = [Math.min(...found), Math.max(...found)];
    else if (/lớn hơn|trên|quá|vượt/.test(condition)) params.max = found[0];
    else params.min = found[0];
  } else if (template === 'position_band') {
    params.anchor = /mép dưới|đáy/.test(condition)
      ? 'bottom'
      : /mép trên|đỉnh/.test(condition)
        ? 'top'
        : 'center';
  } else if (template === 'required_attribute') {
    const labels = ruleLabels(rule.classes);
    const attributes = classes
      .filter((c) => labels.includes('*') || labels.includes(canonicalLabel(c.name)))
      .flatMap((c) => c.attributes);
    params.names = [...new Set(attributes.map((a) => a.name))];
    const values = [...new Set(attributes.flatMap((a) => a.values))];
    if (values.length) params.values = values;
  } else if (template === 'low_confidence') params.below = share(found[0]);
  else if (template === 'max_gap') params.frames = found[0];
  return { template, params, score: RUN_SCORE };
}

// Why a run cannot be used as it stands, or null.
export function runProblem(spec: unknown): string | null {
  const { template, params, score } = (spec ?? {}) as Partial<RunSpec>;
  const definition = RUN_TEMPLATES[template as RunTemplate];
  if (!definition) return 'Chưa chọn cách kiểm tra.';
  if (typeof score !== 'number' || !(score > 0 && score <= 100)) return 'Điểm phải từ 1 tới 100.';
  const given = (params ?? {}) as Record<string, unknown>;
  for (const field of definition.fields) {
    const value = given[field.key];
    if (value === undefined || value === '' || (Array.isArray(value) && !value.length)) {
      if (!field.optional) return `Thiếu “${field.label}”.`;
      continue;
    }
    if (field.kind === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value))
        return `“${field.label}” phải là một số.`;
      if (
        (field.min !== undefined && value < field.min) ||
        (field.max !== undefined && value > field.max)
      )
        return `“${field.label}” phải trong khoảng ${field.min ?? '-∞'}–${field.max ?? '∞'}.`;
    } else if (field.kind === 'choice') {
      if (!field.options!.some(([id]) => id === value)) return `“${field.label}” không hợp lệ.`;
    } else if (!strings(value).length || strings(value).length !== (value as unknown[]).length)
      return `“${field.label}” phải là danh sách tên.`;
  }
  if (template === 'aspect_ratio' && given.min === undefined && given.max === undefined)
    return 'Cần ít nhất một đầu của khoảng.';
  if (template === 'position_band' && given.min_y === undefined && given.max_y === undefined)
    return 'Cần ít nhất một đầu của dải.';
  if (template === 'score_range') {
    if (given.above === undefined && given.below === undefined)
      return 'Cần ngưỡng “lớn hơn” hoặc “nhỏ hơn”.';
    if (
      typeof given.above === 'number' &&
      typeof given.below === 'number' &&
      given.above < given.below
    )
      return '“Lớn hơn” phải từ “nhỏ hơn” trở lên, nếu không mọi box đều bị gắn cờ.';
  }
  return null;
}

// The params of a run, keeping only the fields of its template.
const paramsOf = ({ template, params }: RunSpec) => ({
  ...RUN_TEMPLATES[template].fixed,
  ...Object.fromEntries(
    RUN_TEMPLATES[template].fields
      .map((f) => [f.key, params[f.key]] as const)
      .filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)),
  ),
});

interface RulesFile {
  rules?: unknown;
  choices?: unknown;
  runs?: unknown;
  captions?: unknown;
}
const chosen = (file: RulesFile) => {
  const choices = (file.choices ?? {}) as Record<string, unknown>;
  return (Array.isArray(file.rules) ? file.rules : []).filter(
    (rule): rule is GuidelineRule => isRule(rule) && choices[rule.id] === 'guideline',
  );
};

// The policy patches that run a person's chosen new or stricter rules: one rule per label, all
// under the check "guideline.<rule id>", so reviewers and reports name the guideline rule.
// A rule with no usable run is left out; it stays recorded with the project.
export function patchesFrom(rules: unknown): Patch[] {
  const file = (rules ?? {}) as RulesFile;
  const runs = (file.runs && typeof file.runs === 'object' ? file.runs : {}) as Record<
    string,
    unknown
  >;
  const patches: Patch[] = [];
  for (const rule of chosen(file)) {
    if (!runnable(rule) || runProblem(runs[rule.id])) continue;
    const spec = runs[rule.id] as RunSpec,
      definition = RUN_TEMPLATES[spec.template];
    for (const label of ruleLabels(rule.classes))
      patches.push({
        op: 'add',
        label,
        rule: {
          id: `guideline.${rule.id}.${label === '*' ? 'any' : label}`,
          status: 'active',
          template: spec.template,
          check: `guideline.${rule.id}`,
          params: paramsOf(spec),
          score: Math.round(spec.score),
          error_type: definition.error,
          ...(definition.model && { applies_to: 'model' as const }),
          text: `Guideline ${text(rule.section, 40) || rule.id}: ${text(rule.condition, 300)}`,
        },
        from: { rule: rule.id, section: text(rule.section, 40), quote: text(rule.quote, 300) },
      });
  }
  return patches;
}

// Captions a person wrote for the label verifier, per label of the policy. They are added to
// the policy's own captions (policy/_verifier.json), never replace them.
export const MAX_CAPTIONS = 8;
export function captionsFrom(rules: unknown): Record<string, string[]> {
  const given = ((rules ?? {}) as RulesFile).captions;
  if (!given || typeof given !== 'object') return {};
  const captions: Record<string, string[]> = {};
  for (const [name, list] of Object.entries(given)) {
    const label = canonicalLabel(name);
    if (!POLICY_LABELS.includes(label)) continue;
    const kept = [
      ...new Set(
        strings(list)
          .map((c) => c.trim().replace(/\s+/g, ' '))
          .filter((c) => c.length >= 3),
      ),
    ]
      .map((c) => c.slice(0, 120))
      .slice(0, MAX_CAPTIONS);
    if (kept.length) captions[label] = kept;
  }
  return Object.fromEntries(Object.entries(captions).sort(([a], [b]) => a.localeCompare(b)));
}

// What the project keeps of its guideline for people to read: every rule with the choice made
// on it, and the captions. It never changes scores.
export interface GuidelineSummary {
  name?: string;
  rules: (Pick<
    GuidelineRule,
    'id' | 'section' | 'quote' | 'kind' | 'classes' | 'condition' | 'relation' | 'verdict'
  > & { choice?: 'guideline' | 'policy' })[];
  conflicts: number;
  captions?: Record<string, string[]>;
}
const KINDS = ['check', 'reviewer', 'definition'];
export function summaryFrom(rules: unknown, name?: string): GuidelineSummary {
  const file = (rules ?? {}) as RulesFile & { conflicts?: unknown };
  const choices = (file.choices ?? {}) as Record<string, unknown>;
  const captions = captionsFrom(rules);
  return {
    ...(name && { name: text(name, 200) }),
    rules: (Array.isArray(file.rules) ? file.rules : [])
      .filter((r): r is GuidelineRule => isRule(r) && KINDS.includes(r.kind))
      .slice(0, 500)
      .map((r) => ({
        id: r.id,
        section: text(r.section, 80),
        quote: text(r.quote, 300),
        kind: r.kind,
        classes: strings(r.classes)
          .slice(0, 20)
          .map((c) => c.slice(0, 60)),
        condition: text(r.condition, 300),
        relation: ['new', 'stricter', 'looser'].includes(r.relation) ? r.relation : 'new',
        verdict: ['flag', 'accept', 'none'].includes(r.verdict) ? r.verdict : 'none',
        ...((choices[r.id] === 'guideline' || choices[r.id] === 'policy') && {
          choice: choices[r.id] as 'guideline' | 'policy',
        }),
      })),
    conflicts: Array.isArray(file.conflicts) ? file.conflicts.length : 0,
    ...(Object.keys(captions).length > 0 && { captions }),
  };
}

// The rules a reviewer of a box with this label should keep in mind: those a person must judge
// by eye, and the definitions, for the label or for every label.
export const rulesForLabel = (summary: GuidelineSummary | undefined, label: string) => {
  const own = canonicalLabel(label);
  return (summary?.rules ?? []).filter(
    (r) =>
      (r.kind === 'reviewer' || r.kind === 'definition') &&
      r.classes.some((c) => c.trim() === '*' || canonicalLabel(c) === own),
  );
};

// JSON with object keys in one order, so a value read back from MySQL hashes as it was written.
export const stableJson = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(stableJson).join(',')}]`
    : value && typeof value === 'object'
      ? `{${Object.keys(value)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`)
          .join(',')}}`
      : JSON.stringify(value);

const num = (v: unknown) => String(v).replace('.', ',');
// What a run does, in words a reviewer checks against the guideline's own sentence.
export function describeRun(spec: RunSpec): string {
  const p = spec.params;
  const what = (() => {
    switch (spec.template) {
      case 'score_range': {
        const name = p.source === 'confidence' ? 'confidence' : 'rescore';
        const sides = [
          p.above !== undefined && `${name} > ${num(p.above)}`,
          p.below !== undefined && `${name} < ${num(p.below)}`,
        ].filter(Boolean);
        return `box có ${sides.join(' hoặc ') || name + ' (chưa có ngưỡng)'}`;
      }
      case 'low_confidence':
        return `box nháp của model có confidence < ${num(p.below ?? '?')}`;
      case 'min_size':
        return `box có cạnh ${p.side === 'height' ? 'cao' : p.side === 'width' ? 'rộng' : 'dài'} dưới ${num(p.px ?? '?')} px`;
      case 'aspect_ratio':
        return `box có tỉ lệ cạnh ngoài khoảng ${num(p.min ?? '…')}–${num(p.max ?? '…')}`;
      case 'max_gap':
        return `track biến mất quá ${num(p.frames ?? '?')} frame`;
      default:
        return RUN_TEMPLATES[spec.template].name.toLowerCase();
    }
  })();
  return `Gắn cờ ${what} (+${spec.score} điểm).`;
}
// Where a run says the opposite of its rule: another score, or the other side of the number.
export function runMismatch(
  rule: Pick<GuidelineRule, 'quantities' | 'condition'>,
  spec: RunSpec,
): string | null {
  const said = scoreOf(rule),
    direction = directionOf(rule.condition);
  const runs =
    spec.template === 'score_range'
      ? { score: spec.params.source, above: spec.params.above, below: spec.params.below }
      : spec.template === 'low_confidence'
        ? { score: 'confidence', above: undefined, below: spec.params.below }
        : null;
  if (!runs) return null;
  if (said && runs.score && said !== runs.score)
    return `Guideline nói về ${said}, nhưng check này đo ${runs.score}.`;
  if (direction === 'above' && runs.above === undefined && runs.below !== undefined)
    return 'Guideline gắn cờ khi điểm LỚN HƠN ngưỡng, nhưng check này gắn cờ khi NHỎ HƠN.';
  if (direction === 'below' && runs.below === undefined && runs.above !== undefined)
    return 'Guideline gắn cờ khi điểm NHỎ HƠN ngưỡng, nhưng check này gắn cờ khi LỚN HƠN.';
  return null;
}
