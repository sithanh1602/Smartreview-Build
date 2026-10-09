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
const FILE_NAME = ['file_name', 'filename', 'file', 'image', 'name'];

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const key = (name) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
function find(sources, names) {
  for (const source of sources) {
    if (!object(source)) continue;
    for (const [name, value] of Object.entries(source))
      if (names.includes(key(name)) && value != null && value !== '') return value;
  }
  return undefined;
}
// A probability in [0, 1]: a number, a numeric string, "89%", or a list whose best value counts.
// A bare 89 stays unread because its scale is not stated.
function probability(value) {
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

// Sources are searched in order, so a field on the annotation wins over its attributes.
export function readSignals(...sources) {
  const confidence = probability(find(sources, CONFIDENCE));
  const label = find(sources, TOP2_LABEL),
    score = probability(find(sources, TOP2_SCORE));
  return {
    ...(confidence !== undefined && { confidence }),
    ...(typeof label === 'string' &&
      label.trim() &&
      score !== undefined && { top2: { label_top2: label.trim(), score_top2: score } }),
  };
}
export const readEnvRisk = (...sources) => probability(find(sources, ENV_RISK));
// Fills confidence and top-2 on a normalized annotation from its own attributes.
export function applySignals(annotation, ...sources) {
  const signals = readSignals(...sources, annotation.attributes);
  if (annotation.confidence == null && signals.confidence !== undefined)
    annotation.confidence = signals.confidence;
  if (signals.top2) annotation.attributes = { ...annotation.attributes, ...signals.top2 };
  return annotation;
}

function cells(line) {
  const out = [];
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
export function parseImageTable(text) {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const header = cells(lines[0] || '').map(key);
  const file = header.findIndex((h) => FILE_NAME.includes(h)),
    env = header.findIndex((h) => ENV_RISK.includes(h));
  if (file < 0) throw new Error('Image table: thiếu cột tên file (file_name).');
  if (env < 0) throw new Error('Image table: thiếu cột env_risk.');
  const result = new Map();
  for (const line of lines.slice(1)) {
    const row = cells(line),
      risk = probability(row[env]);
    if (row[file] && risk !== undefined) result.set(row[file].trim(), risk);
  }
  return result;
}
// Rows are matched to media by exact name, then by a basename that is unique on both sides.
export function applyEnvRisk(data, byName) {
  const base = (name) => name.split('/').pop();
  const unique = (names) => {
    const seen = new Map();
    for (const name of names) seen.set(base(name), seen.has(base(name)) ? null : name);
    return seen;
  };
  const rows = unique(byName.keys()),
    media = unique(data.media.map((m) => m.name));
  const names = new Map(data.media.map((m) => [m.id, m.name]));
  const risks = { ...data.dataset.metadata?.env_risk };
  for (const frame of data.frames) {
    const name = names.get(frame.media_id);
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
