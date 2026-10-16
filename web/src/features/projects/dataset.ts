import { locateSignals, parseImageTable, signalOf } from '../../../core/importers/signals.ts';
// The catalog is the part of the importers that runs in a browser; ../index.ts does not.
import { FORMAT_INFO, PARSERS, detectFormats } from '../../../core/importers/catalog.ts';
import type { FormatId, SourceFile } from '../../../core/importers/catalog.ts';
import { readZip } from '../../lib/zip.ts';
import type { ZipEntry } from '../../lib/zip.ts';

// What the browser can tell about a dataset before it is uploaded: which file holds the
// annotations, which images it names and where its optional signals sit. The server still
// validates everything; this only saves a failed upload and shows what will be read.
export const LIMITS = {
  annotation: 10 * 1024 * 1024,
  image: 20 * 1024 * 1024,
  total: 200 * 1024 * 1024,
  images: 100,
};
export const IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
export const ANNOTATION_TYPES = ['.xml', '.json', '.txt', '.names', '.yaml', '.yml'];
export type Format = FormatId;
export type Signal = 'confidence' | 'top2_label' | 'top2_score' | 'env_risk' | 'rescore';
export interface Inspection {
  format: Format;
  // Image paths as the annotation states them; uploads are matched against these by the server.
  images: string[];
  annotations: number;
  sampled: number;
  signals: Partial<Record<Signal, { path: string; count: number; of: number }>>;
}

const SAMPLE = 5000;
const extension = (name: string) => name.slice(name.lastIndexOf('.')).toLowerCase();
const record = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const unescape = (text: string) =>
  text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) =>
    name === 'amp' ? '&' : name === 'lt' ? '<' : name === 'gt' ? '>' : name === 'quot' ? '"' : "'",
  );

// The path most records use for a signal, and how many records carry the signal at all.
class Tally {
  paths = new Map<string, number>();
  add(path: string | undefined) {
    if (path !== undefined) this.paths.set(path, (this.paths.get(path) ?? 0) + 1);
  }
  result(of: number) {
    const ranked = [...this.paths].sort((a, b) => b[1] - a[1]);
    if (!ranked.length) return undefined;
    const others = ranked.length - 1;
    return {
      path: ranked[0][0] + (others ? ` (+${others})` : ''),
      count: Math.min(
        of,
        ranked.reduce((n, [, c]) => n + c, 0),
      ),
      of,
    };
  }
}
function tally(records: unknown[], prefix = '') {
  const kinds: Signal[] = ['confidence', 'top2_label', 'top2_score', 'env_risk', 'rescore'];
  const tallies = Object.fromEntries(kinds.map((k) => [k, new Tally()])) as Record<Signal, Tally>;
  for (const item of records) {
    const found = locateSignals(item);
    for (const kind of kinds) tallies[kind].add(found[kind] && prefix + found[kind].path);
  }
  return tallies;
}

export function inspectAnnotation(name: string, text: string): Inspection | null {
  if (extension(name) === '.xml') {
    if (!/<annotations[\s>]/.test(text) || !/<version>\s*1\.1\s*<\/version>/.test(text))
      return null;
    const shapes = text.match(/<(box|polygon|polyline)\b/g)?.length ?? 0;
    // CVAT keeps signals as named attributes of a shape, so the names are counted.
    const names = new Map<Signal, Tally>();
    for (const [, raw] of text.matchAll(/<attribute\s+name="([^"]*)"/g)) {
      const kind = signalOf(unescape(raw));
      if (!kind) continue;
      if (!names.has(kind)) names.set(kind, new Tally());
      names.get(kind)!.add(`attribute "${unescape(raw)}"`);
    }
    return {
      format: 'cvat-images',
      images: [...text.matchAll(/<image\b[^>]*?\sname="([^"]*)"/g)].map((m) => unescape(m[1])),
      annotations: shapes,
      sampled: shapes,
      signals: Object.fromEntries([...names].map(([kind, t]) => [kind, t.result(shapes)])),
    };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!record(data) || !Array.isArray(data.annotations)) return null;
  const sample = data.annotations.slice(0, SAMPLE);
  if (Array.isArray(data.images) && Array.isArray(data.categories)) {
    const found = tally(sample),
      images = data.images.slice(0, SAMPLE),
      env = tally(images).env_risk.result(images.length);
    return {
      format: 'coco-detection',
      images: data.images.map((i) => (record(i) ? String(i.file_name ?? '') : '')).filter(Boolean),
      annotations: data.annotations.length,
      sampled: sample.length,
      signals: {
        confidence: found.confidence.result(sample.length),
        top2_label: found.top2_label.result(sample.length),
        top2_score: found.top2_score.result(sample.length),
        rescore: found.rescore.result(sample.length),
        ...(env && { env_risk: env }),
      },
    };
  }
  if (typeof data.schema_version !== 'string' || !Array.isArray(data.frames)) return null;
  // The native schema states confidence on the annotation; anything else sits in attributes.
  const found = tally(
      sample.map((a) => (record(a) ? a.attributes : null)),
      'attributes.',
    ),
    stated = sample.filter((a) => record(a) && typeof a.confidence === 'number').length;
  for (let i = 0; i < stated; i++) found.confidence.add('confidence');
  return {
    format: 'smartreview-json',
    images: data.frames
      .map((f) => (record(f) && typeof f.image === 'string' ? f.image : ''))
      .filter(Boolean),
    annotations: data.annotations.length,
    sampled: sample.length,
    signals: {
      confidence: found.confidence.result(sample.length),
      top2_label: found.top2_label.result(sample.length),
      top2_score: found.top2_score.result(sample.length),
      rescore: found.rescore.result(sample.length),
    },
  };
}

// A summary for the formats without a hand-written one above: the importer itself reads the
// files, with a stand-in for the image sizes it would take from the uploaded images.
function summarize(format: Format, files: SourceFile[]): Inspection {
  const data = PARSERS[format]!(files, { sizes: () => ({ width: 1, height: 1 }) });
  const sample = data.annotations.slice(0, SAMPLE);
  const found = tally(
    sample.map((a) => a.attributes ?? null),
    'attributes.',
  );
  for (const a of sample) if (typeof a.confidence === 'number') found.confidence.add('confidence');
  return {
    format,
    images: data.frames.map((f) => (f.image ?? '').replace(/^images\//, '')).filter(Boolean),
    annotations: data.annotations.length,
    sampled: sample.length,
    signals: {
      confidence: found.confidence.result(sample.length),
      top2_label: found.top2_label.result(sample.length),
      top2_score: found.top2_score.result(sample.length),
      rescore: found.rescore.result(sample.length),
    },
  };
}

// One annotation set found among some files: a single file, or all the files of a per-image
// format.
export interface Candidate {
  key: string;
  label: string;
  format: Format;
  files: SourceFile[];
  inspection: Inspection;
}
const OWN_SUMMARY: Format[] = ['cvat-images', 'coco-detection', 'smartreview-json'];
// `only` keeps the sets of one format. `problem` says why a set that looked right could not
// be read, for when nothing else is found.
export function inspectSources(files: SourceFile[], only?: Format) {
  const candidates: Candidate[] = [];
  let problem: string | undefined;
  for (const { format, files: members } of detectFormats(files)) {
    if (only && format !== only) continue;
    let inspection: Inspection | null = null;
    try {
      inspection = OWN_SUMMARY.includes(format)
        ? inspectAnnotation(members[0].name, members[0].text)
        : summarize(format, members);
    } catch (e) {
      problem ??= (e as Error).message;
    }
    if (!inspection) continue;
    candidates.push({
      key: `${format}:${members[0].name}`,
      label:
        members.length === 1
          ? members[0].name
          : `${FORMAT_INFO[format].label.split(' · ')[0]} · ${members.length} tệp`,
      format,
      files: members,
      inspection,
    });
  }
  return { candidates, problem };
}

// Pairs each referenced image with an archive entry by the longest shared path ending, so an
// archive laid out as data/images/a.jpg still matches a reference to images/a.jpg or a.jpg.
function pairImages(references: string[], entries: ZipEntry[]) {
  const byBase = new Map<string, ZipEntry[]>();
  const parts = (path: string) => path.split('/').filter(Boolean);
  // YOLO, KITTI, MOT and CVAT for video name an image without its extension.
  const bare = (path: string) =>
    IMAGE_TYPES.includes(extension(path)) ? path.slice(0, -extension(path).length) : path;
  const named = (reference: string) => IMAGE_TYPES.includes(extension(reference));
  for (const entry of entries)
    for (const base of new Set([parts(entry.name).pop()!, bare(parts(entry.name).pop()!)]))
      byBase.set(base, [...(byBase.get(base) ?? []), entry]);
  const shared = (a: string[], b: string[]) => {
    let n = 0;
    while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
    return n;
  };
  const paired: { name: string; entry: ZipEntry }[] = [],
    missing: string[] = [],
    used = new Set<ZipEntry>();
  for (const name of references) {
    const wanted = parts(name),
      scored = (byBase.get(wanted.at(-1) ?? '') ?? [])
        .filter((e) => !used.has(e))
        .map((entry) => ({
          entry,
          score: shared(wanted, parts(named(name) ? entry.name : bare(entry.name))),
        }))
        .sort((a, b) => b.score - a.score);
    if (!scored.length || (scored.length > 1 && scored[0].score === scored[1].score))
      missing.push(name);
    else {
      used.add(scored[0].entry);
      // The upload carries the extension the server needs to recognise the image.
      paired.push({
        name: named(name) ? name : name + extension(scored[0].entry.name),
        entry: scored[0].entry,
      });
    }
  }
  return { paired, missing, unused: entries.length - used.size };
}

export interface Pack {
  // The files of the chosen annotation set, named as the server should receive them.
  annotations: File[];
  // The chosen set and every set the archive holds, to pick another one.
  chosen: Candidate;
  inspection: Inspection;
  alternatives: Candidate[];
  metadata: File | null;
  guideline: ZipEntry | null;
  images: { name: string; entry: ZipEntry }[];
  missing: string[];
  unused: number;
  ignored: number;
}

const depth = (name: string) => name.split('/').length;
const hidden = (name: string) =>
  name.split('/').some((p) => p.startsWith('.') || p === '__MACOSX') || /thumbs\.db$/i.test(name);
const GUIDELINE = /guide|polic|quy[\s_-]?(dinh|tac|định|tắc)|huong[\s_-]?dan|hướng/i;

// `format` is set when the project already exists and its format can no longer change;
// `choice` names the annotation file to use when the archive holds several.
export async function readPack(file: File, format?: Format, choice?: string): Promise<Pack> {
  const all = await readZip(file),
    entries = all.filter((e) => !hidden(e.name)).sort((a, b) => depth(a.name) - depth(b.name));
  const text = async (entry: ZipEntry) => (await entry.blob()).text();
  // Every text file that could belong to an annotation set, within a budget.
  let budget = 4 * LIMITS.annotation;
  const sources: SourceFile[] = [];
  for (const entry of entries) {
    if (!ANNOTATION_TYPES.includes(extension(entry.name)) || entry.size > LIMITS.annotation)
      continue;
    if ((budget -= entry.size) < 0) break;
    sources.push({ name: entry.name, text: await text(entry) });
  }
  const { candidates, problem } = inspectSources(sources, format);
  if (!candidates.length)
    throw new Error(
      problem ??
        (format
          ? 'Tệp nén không có tệp nhãn đúng định dạng của dự án.'
          : 'Tệp nén không có tệp nhãn thuộc định dạng được hỗ trợ.'),
    );
  const chosen = candidates.find((c) => c.key === choice) ?? candidates[0];
  const { inspection } = chosen;
  const inSet = new Set(chosen.files.map((f) => f.name));
  let metadata: File | null = null;
  for (const entry of entries) {
    if (extension(entry.name) !== '.csv' || entry.size > LIMITS.annotation) continue;
    const content = await text(entry);
    try {
      parseImageTable(content);
    } catch {
      continue;
    }
    metadata = new File([content], 'images.csv', { type: 'text/csv' });
    break;
  }
  const pictures = entries.filter((e) => IMAGE_TYPES.includes(extension(e.name)));
  const { paired, missing, unused } = pairImages(inspection.images, pictures);
  const guideline =
    entries.find(
      (e) =>
        !inSet.has(e.name) &&
        ['.md', '.markdown', '.txt', '.docx', '.pdf'].includes(extension(e.name)) &&
        GUIDELINE.test(e.name.split('/').pop()!) &&
        e.size <= LIMITS.annotation,
    ) ?? null;
  return {
    annotations: chosen.files.map(
      (f) =>
        new File(
          [f.text],
          FORMAT_INFO[chosen.format].multiple ? f.name : 'annotations' + extension(f.name),
        ),
    ),
    chosen,
    inspection,
    alternatives: candidates,
    metadata,
    guideline,
    images: paired,
    missing,
    unused,
    ignored: all.length - entries.length,
  };
}
