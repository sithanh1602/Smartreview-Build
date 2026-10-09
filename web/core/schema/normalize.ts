import Ajv from 'ajv';
import fs from 'node:fs';
import type { Dataset } from './types.ts';

export const SCHEMA_VERSION = '1.0.0';
const schema = JSON.parse(
  fs.readFileSync(new URL('./annotation-v1.schema.json', import.meta.url), 'utf8'),
);
const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);

// Normalization never fabricates confidence, tracking or model provenance.
export function normalizeDataset(input: unknown): Dataset {
  // Typed as Dataset from here on; the schema check below is what makes that true.
  const data = structuredClone(input) as Dataset;
  if (data?.schema_version !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schema_version ${data?.schema_version}; expected ${SCHEMA_VERSION}. Use an explicit migration.`,
    );
  }
  for (const annotation of data.annotations || []) {
    for (const field of ['confidence', 'track_id', 'object_id', 'source'] as const) {
      if (annotation[field] == null) delete annotation[field];
    }
  }
  if (!validate(data))
    throw new Error(`Invalid annotation schema: ${new Ajv().errorsText(validate.errors)}`);
  function indexUnique<T extends { id: string }>(items: T[], label: string) {
    const result = new Map<string, T>();
    for (const item of items) {
      if (result.has(item.id)) throw new Error(`Duplicate ${label} id: ${item.id}`);
      result.set(item.id, item);
    }
    return result;
  }
  const media = indexUnique(data.media, 'media');
  const frames = indexUnique(data.frames, 'frame');
  indexUnique(data.annotations, 'annotation');
  const positions = new Set<string>();
  for (const frame of data.frames) {
    const m = media.get(frame.media_id);
    if (!m) throw new Error(`Unknown media reference: ${frame.media_id}`);
    if (
      (m.type === 'image' && frame.index !== 0) ||
      (m.frame_count && frame.index >= m.frame_count)
    ) {
      throw new Error(`Frame index out of range: ${frame.id}`);
    }
    const key = JSON.stringify([m.id, frame.index]);
    if (positions.has(key)) throw new Error(`Duplicate media/frame index: ${key}`);
    positions.add(key);
    if (
      frame.image &&
      (frame.image.startsWith('/') ||
        frame.image.includes('\\') ||
        frame.image.split('/').includes('..') ||
        /^[a-z]+:/i.test(frame.image))
    ) {
      throw new Error(`Frame image must be a dataset-relative local path: ${frame.image}`);
    }
  }
  const tracks = new Set<string>();
  for (const a of data.annotations) {
    const f = frames.get(a.frame_id);
    if (!f) throw new Error(`Unknown frame reference: ${a.frame_id}`);
    if (a.track_id !== undefined) {
      const key = JSON.stringify([f.media_id, f.index, a.track_id]);
      if (tracks.has(key)) throw new Error(`Ambiguous track observations: ${key}`);
      tracks.add(key);
    }
  }
  return data;
}
