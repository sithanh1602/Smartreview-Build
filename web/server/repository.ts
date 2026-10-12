import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { normalizeDataset } from '../core/schema/normalize.ts';
import { analyzeDataset, supportsWaivers, severity } from '../core/risk/engine.ts';
import { canonicalWaivers, type Waivers } from '../shared/guideline-waivers.ts';
import type { Source } from '../core/schema/types.ts';
import type { CheckStat, ContextPosition, RiskResult } from '../core/risk/types.ts';

export const riskLevel = severity;
export interface DatasetMeta {
  dataset_id: string;
  dataset_reference: string;
  name: string;
  // Set when the dataset is served as a project.
  project_name?: string;
  schema_version: string;
  engine_version: string;
  source?: Source;
  width: number;
  height: number;
  fps?: number;
  frame_count: number;
  media_count: number;
  total_annotations: number;
  total_cases: number;
  total_tracks: number;
  levels: Record<string, number>;
  checks: Record<string, CheckStat>;
  // Stored with the project and read back on every load, like engine_version.
  guideline_waivers?: Waivers;
  review_storage: 'mysql';
}

export interface DatasetOptions {
  namespace?: string;
  apiPrefix?: string;
  engineVersion?: string;
  // Policy checks a project's guideline choices switched off; see shared/guideline-waivers.ts.
  waivers?: Waivers;
}
// Where frame images live: locate turns a frame's relative image path into an asset reference, read fetches it.
export interface AssetSource {
  remote: boolean;
  locate(image: string): string | Promise<string>;
  read(asset: string): Promise<Buffer | null>;
}
export async function loadDataset(datasetPath: string, options: DatasetOptions = {}) {
  const text = await fs.readFile(datasetPath, 'utf8');
  const directory = await fs.realpath(path.dirname(datasetPath));
  return buildDataset(text, options, {
    remote: false,
    async locate(image) {
      const asset = await fs.realpath(path.join(directory, image));
      if (!asset.startsWith(directory + path.sep))
        throw new Error('Frame image escapes dataset directory');
      return asset;
    },
    read: (asset) => fs.readFile(asset),
  });
}
export async function buildDataset(
  text: string,
  { namespace = '', apiPrefix = '/api', engineVersion, waivers: given = {} }: DatasetOptions,
  source: AssetSource,
) {
  const waivers = canonicalWaivers(given);
  const normalized = normalizeDataset(JSON.parse(text));
  // Engines before 4.0.0 know nothing of waivers, so only the later ones are given them.
  const applied =
    Object.keys(waivers).length > 0 && !!engineVersion && supportsWaivers(engineVersion);
  const report = analyzeDataset(
    normalized,
    engineVersion ? { engineVersion, ...(applied && { waivers }) } : undefined,
  );
  // Scores under different waivers are different revisions. With none, the fingerprint is the
  // one it always was, so existing projects keep their revision and their decisions.
  const datasetId = createHash('sha256')
    .update(namespace)
    .update(text)
    .update(report.engine_version)
    .update(applied ? JSON.stringify(waivers) : '')
    .digest('hex')
    .slice(0, 20);
  const frames = new Map(normalized.frames.map((f) => [f.id, f]));
  const media = new Map(normalized.media.map((m) => [m.id, m]));
  const annotations = new Map(normalized.annotations.map((a) => [a.id, a]));
  const assets = new Map<string, string>();
  for (const f of normalized.frames) {
    if (!f.image) continue;
    const asset = await source.locate(f.image);
    const extension = path.extname(asset).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(extension))
      throw new Error(`Unsupported image type ${extension}`);
    assets.set(f.id, asset);
  }
  function observation(id: string) {
    const a = annotations.get(id)!,
      frame = frames.get(a.frame_id)!,
      m = media.get(frame.media_id)!;
    const g = a.geometry;
    return {
      ...a,
      annotation_id: a.id,
      source: a.source || m.source || normalized.dataset.source,
      frame_ref: frame.id,
      frame_id: frame.index,
      media_id: m.id,
      media_name: m.name,
      media_type: m.type,
      width: m.width,
      height: m.height,
      fps: m.fps,
      class_name: a.label,
      ...(g.type === 'bbox'
        ? {
            bbox: {
              x1: g.x,
              y1: g.y,
              x2: g.x + g.width,
              y2: g.y + g.height,
              width: g.width,
              height: g.height,
            },
          }
        : {}),
      image_url: assets.has(frame.id)
        ? `${apiPrefix}/assets/${encodeURIComponent(frame.id)}?dataset=${datasetId}`
        : null,
    };
  }
  function project(result: RiskResult) {
    const current = observation(result.reference.annotation_id);
    return {
      ...result,
      ...current,
      id: result.id,
      score: result.score,
      risk_score: result.score,
      risk_level: result.severity,
      source: current.source || normalized.dataset.source,
      context: Object.fromEntries(
        Object.entries(result.context).map(([position, id]) => [position, observation(id)]),
      ) as Partial<Record<ContextPosition, ReturnType<typeof observation>>>,
    };
  }
  const cases = report.cases.map(project),
    allCases = report.results.map(project);
  const firstMedia = normalized.media[0];
  const meta: DatasetMeta = {
    dataset_id: datasetId,
    dataset_reference: normalized.dataset.id,
    name: normalized.dataset.name,
    schema_version: normalized.schema_version,
    engine_version: report.engine_version,
    source: normalized.dataset.source,
    width: firstMedia.width,
    height: firstMedia.height,
    fps: firstMedia.fps,
    frame_count: normalized.frames.length,
    media_count: normalized.media.length,
    total_annotations: normalized.annotations.length,
    total_cases: cases.length,
    total_tracks: new Set(
      normalized.annotations
        .filter((a) => a.track_id !== undefined)
        .map((a) => JSON.stringify([frames.get(a.frame_id)!.media_id, a.track_id])),
    ).size,
    levels: Object.fromEntries(
      ['high', 'medium', 'low'].map((level) => [
        level,
        cases.filter((c) => c.severity === level).length,
      ]),
    ),
    checks: report.checks,
    ...(applied && { guideline_waivers: waivers }),
    review_storage: 'mysql',
  };
  const readAsset = async (frameId: string) =>
    assets.has(frameId) ? source.read(assets.get(frameId)!) : null;
  return { normalized, report, assets, readAsset, remote: source.remote, cases, allCases, meta };
}
