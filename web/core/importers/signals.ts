import type { Dataset } from '../schema/types.ts';

// Optional model signals under the names exporters commonly use.
// A value is read only when the source states it; nothing is inferred from geometry or labels.
const CONFIDENCE = ['confidence', 'score', 'scores', 'conf', 'prob', 'probability', 'certainty'];
const TOP2_LABEL = ['label_top2', 'class_top2', 'top2_label', 'top2_class', 'second_label'];
const TOP2_SCORE = [
  'score_top2',
  'confidence_top2',
  'conf_top2',
  'prob_top2',
  'top2_score',
  'top2_confidence',
  'second_score',
];
const ENV_RISK = ['env_risk', 'envrisk', 'environment_risk'];
// A model's score for a box a person drew (ai-service/score_boxes.py). Its scale is not that of a
// model's own box, so it is kept apart from the confidence and never makes the box model output.
const RESCORE = ['rescore'];
const FILE_NAME = ['file_name', 'filename', 'file', 'image', 'name'];

// Exporter records are foreign input: nothing about their shape is known until it is read.
export type Loose = Record<string, any>;
export interface ImportOptions {
  id?: string;
  name?: string;
  // Width and height of an image the annotations name. Formats that do not state image sizes
  // (YOLO, KITTI, MOT, some CVAT video exports) cannot be read without it.
  sizes?: (image: string) => { width: number; height: number } | undefined;
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
// "Score", "top2Score" and "top2-score" all name the same field.
const key = (name: string) =>
  name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
// An object holding the runner-up class on its own, such as top2: { label, score }.
const TOP2_GROUP = ['top2', 'top_2', 'second', 'second_best', 'runner_up'];
const GROUP_LABEL = ['label', 'class', 'class_name', 'category', 'name'];
// Exporters nest signals at different depths (attributes.model.score, meta.detection.conf), so
// every source is searched breadth-first: the field nearest the record wins, and an unusable
// value does not hide a usable one deeper down. Lists are not entered, since their items are
// other records. A runner-up group is entered only when asked for, so its score is never taken
// for the confidence of the label itself.
const MAX_DEPTH = 4,
  MAX_FIELDS = 400;
export interface Found<T> {
  value: T;
  path: string;
}
function find<T>(
  sources: unknown[],
  names: string[],
  read: (value: unknown) => T | undefined,
  groups: 'skip' | 'only' = 'skip',
): Found<T> | undefined {
  for (const source of sources) {
    if (!object(source)) continue;
    let level: [Record<string, unknown>, string, boolean][] = [[source, '', false]],
      seen = 0;
    for (let depth = 0; depth <= MAX_DEPTH && level.length; depth++) {
      const next: typeof level = [];
      for (const [node, prefix, grouped] of level)
        for (const [name, raw] of Object.entries(node)) {
          if (++seen > MAX_FIELDS) break;
          const path = prefix + name,
            group = TOP2_GROUP.includes(key(name));
          if (names.includes(key(name)) && grouped === (groups === 'only')) {
            const value = read(raw);
            if (value !== undefined) return { value, path };
          }
          if (object(raw) && (grouped || !group || groups === 'only'))
            next.push([raw, path + '.', grouped || group]);
        }
      level = next;
    }
  }
  return undefined;
}
// A probability in [0, 1]: a number, a numeric string, "89%", or a list whose best value counts.
// A bare 89 stays unread because its scale is not stated.
function probability(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    const values = value.map(probability).filter((v) => v !== undefined);
    return values.length ? Math.max(...values) : undefined;
  }
  let number = value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return undefined;
    number = text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text);
  }
  return typeof number === 'number' && number >= 0 && number <= 1 ? number : undefined;
}
const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

// Where each signal sits in a record, for showing the user what an import will read.
export function locateSignals(...sources: unknown[]) {
  return {
    confidence: find(sources, CONFIDENCE, probability),
    top2_label: find(sources, TOP2_LABEL, text) ?? find(sources, GROUP_LABEL, text, 'only'),
    top2_score:
      find(sources, TOP2_SCORE, probability) ?? find(sources, CONFIDENCE, probability, 'only'),
    env_risk: find(sources, ENV_RISK, probability),
    rescore: find(sources, RESCORE, probability),
  };
}
// The signal a single field name stands for, for sources that only list names (CVAT attributes).
export function signalOf(name: string) {
  const k = key(name);
  return CONFIDENCE.includes(k)
    ? 'confidence'
    : TOP2_LABEL.includes(k)
      ? 'top2_label'
      : TOP2_SCORE.includes(k)
        ? 'top2_score'
        : ENV_RISK.includes(k)
          ? 'env_risk'
          : RESCORE.includes(k)
            ? 'rescore'
            : undefined;
}
// Sources are searched in order, so a field on the annotation wins over its attributes.
export function readSignals(...sources: unknown[]) {
  const found = locateSignals(...sources);
  const confidence = found.confidence?.value,
    label = found.top2_label?.value,
    score = found.top2_score?.value,
    rescore = found.rescore?.value;
  return {
    ...(confidence !== undefined && { confidence }),
    ...(rescore !== undefined && { rescore }),
    ...(label !== undefined &&
      score !== undefined && { top2: { label_top2: label, score_top2: score } }),
  };
}
export const readEnvRisk = (...sources: unknown[]) => find(sources, ENV_RISK, probability)?.value;
// Fills confidence, top-2 and rescore on a normalized annotation from its own attributes.
export function applySignals<
  T extends { confidence?: number | null; attributes?: Record<string, unknown> },
>(annotation: T, ...sources: unknown[]): T {
  const signals = readSignals(...sources, annotation.attributes);
  if (annotation.confidence == null && signals.confidence !== undefined)
    annotation.confidence = signals.confidence;
  if (signals.top2) annotation.attributes = { ...annotation.attributes, ...signals.top2 };
  if (signals.rescore !== undefined)
    annotation.attributes = { ...annotation.attributes, rescore: signals.rescore };
  return annotation;
}

function cells(line: string) {
  const out: string[] = [];
  let cell = '',
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') cell += line[i++];
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cell);
      cell = '';
    } else cell += c;
  }
  return [...out, cell];
}
// Per-image table (one row per image) such as images.csv: file name → env_risk.
export function parseImageTable(text: string) {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const header = cells(lines[0] || '').map(key);
  const file = header.findIndex((h) => FILE_NAME.includes(h)),
    env = header.findIndex((h) => ENV_RISK.includes(h));
  if (file < 0) throw new Error('Image table: thiếu cột tên file (file_name).');
  if (env < 0) throw new Error('Image table: thiếu cột env_risk.');
  const result = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const row = cells(line),
      risk = probability(row[env]);
    if (row[file] && risk !== undefined) result.set(row[file].trim(), risk);
  }
  return result;
}
// Objects a model found that no drawn box covers (ai-service/score_boxes.py). They are hints
// for the frame rule coverage.model_missing, kept by frame in the dataset metadata, never labels.
export const MISSING_HINTS = 'smartreview_missing';
export interface MissingHint {
  label: string;
  confidence: number;
  geometry: { type: 'bbox'; x: number; y: number; width: number; height: number };
}
// `frameOf` names the frame of a hint, `box` gives [x, y, width, height]. A hint that names no
// known frame, label or usable box is left out.
export function readMissingHints(
  objects: unknown,
  frameOf: (hint: Loose) => string,
  box: (hint: Loose) => unknown[],
  labelOf: (hint: Loose) => string | undefined = (hint) => text(hint.label),
) {
  const hints: Record<string, MissingHint[]> = {};
  for (const hint of Array.isArray(objects) ? objects : objects == null ? [] : [objects]) {
    if (!object(hint)) continue;
    const [x, y, width, height] = box(hint).map(Number),
      label = labelOf(hint),
      confidence = probability(hint.score);
    if (!label || confidence === undefined || ![x, y, width, height].every(Number.isFinite))
      continue;
    if (width <= 0 || height <= 0) continue;
    (hints[frameOf(hint)] ??= []).push({
      label,
      confidence,
      geometry: { type: 'bbox', x, y, width, height },
    });
  }
  return hints;
}
export function applyMissingHints(data: Dataset, hints: Record<string, MissingHint[]>) {
  const frames = new Set(data.frames.map((f) => f.id));
  const kept = Object.fromEntries(Object.entries(hints).filter(([frame]) => frames.has(frame)));
  if (Object.keys(kept).length)
    data.dataset.metadata = { ...data.dataset.metadata, missing_hints: kept };
  return data;
}
// Rows are matched to media by exact name, then by a basename that is unique on both sides.
export function applyEnvRisk(data: Dataset, byName: Map<string, number>) {
  const base = (name: string) => name.split('/').pop()!;
  const unique = (names: Iterable<string>) => {
    const seen = new Map<string, string | null>();
    for (const name of names) seen.set(base(name), seen.has(base(name)) ? null : name);
    return seen;
  };
  const rows = unique(byName.keys()),
    media = unique(data.media.map((m) => m.name));
  const names = new Map(data.media.map((m) => [m.id, m.name]));
  const risks: Record<string, unknown> = {
    ...(data.dataset.metadata?.env_risk as Record<string, unknown> | undefined),
  };
  for (const frame of data.frames) {
    const name = names.get(frame.media_id)!;
    const row = byName.has(name)
      ? name
      : media.get(base(name)) === name
        ? rows.get(base(name))
        : null;
    if (row != null) risks[frame.id] = byName.get(row);
  }
  if (Object.keys(risks).length)
    data.dataset.metadata = { ...data.dataset.metadata, env_risk: risks };
  return data;
}
