import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// policy3d/ is not read by any engine yet (docs/policy-3d.md): these tests keep it well formed,
// so a 3D engine can load it as written.
const dir = new URL('../policy3d/', import.meta.url);
const files = Object.fromEntries(
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(new URL(f, dir), 'utf8'))]),
);
const body = (name: string) => files[name][`${name.replace(/^_/, '')}_policy`];
const dataset = body('_dataset');
const labelFiles: string[] = dataset.labels;
const pairFiles = Object.keys(files).filter((n) => !n.startsWith('_') && body(n).pair);
const rules = Object.keys(files).flatMap((n) =>
  (body(n).rules ?? []).map((r: any) => ({ file: n, ...r })),
);
// The 3D templates of docs/policy-3d.md, and the 2D ones the 3D policy reuses.
const TEMPLATES = [
  'valid_cuboid',
  'size_range',
  'axis_order',
  'lidar_points',
  'ground_contact',
  'range_limit',
  'ego_overlap',
  'allowed_labels',
  'overlap_3d',
  'inside_3d',
  'rigid_size',
  'max_speed',
  'heading_jump',
  'heading_vs_motion',
  'static_object',
  'min_track_length',
  'lidar_count',
  'pose_jump',
  'low_confidence',
  'constant_in_track',
  'max_gap',
  'frame_count',
  'manual',
];
const ERROR_TYPES = ['CLASS', 'EXTRA_OBJECT', 'BBOX', 'ATTRIBUTE', 'TRACK'];

test('every file wraps its body in <name>_policy, one file per label and per pair', () => {
  for (const name of Object.keys(files)) assert.ok(body(name), name);
  assert.deepEqual(
    Object.keys(files)
      .filter((n) => !n.startsWith('_') && !pairFiles.includes(n))
      .sort(),
    [...labelFiles].sort(),
  );
  for (const label of labelFiles) assert.equal(body(label).label, label);
  for (const pair of pairFiles) assert.equal(body(pair).pair.join('_'), pair);
  assert.deepEqual(
    [...dataset.groups.core, ...dataset.groups.bonus].sort(),
    [...labelFiles].sort(),
  );
});

test('rules are unique, named after their file, and only proposed or manual', () => {
  const ids = rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  const prefix = (file: string) =>
    file === '_dataset' ? 'any' : file === '_frame' ? 'frame' : file;
  for (const r of rules) {
    assert.equal(r.id.split('.')[0], prefix(r.file), r.id);
    // No 3D engine runs these yet; "active" would claim otherwise.
    assert.ok(['proposed', 'manual'].includes(r.status), r.id);
    assert.ok(TEMPLATES.includes(r.template), `${r.id}: template ${r.template}`);
    assert.ok(r.text && r.source, r.id);
  }
});

test('a rule that can run says how: params, a score or a frame decision, a known error type', () => {
  const sources = new Set(dataset.sources.map((s: any) => s.id));
  for (const r of rules) {
    assert.ok(sources.has(r.source), `${r.id}: source ${r.source}`);
    if (r.template === 'manual') {
      assert.equal(r.check, null, r.id);
      assert.equal(r.score, undefined, r.id);
      continue;
    }
    assert.ok(r.check && r.params, r.id);
    if (r.file === '_frame') assert.equal(typeof r.blocking, 'boolean', r.id);
    else assert.ok(Number.isInteger(r.score) && r.score > 0 && r.score <= 100, r.id);
    if (r.error_type) assert.ok(ERROR_TYPES.includes(r.error_type), r.id);
  }
});

test('ranges are ordered and in metres; track rules ask for a track', () => {
  for (const r of rules) {
    for (const [key, value] of Object.entries<any>(r.params ?? {}))
      if (key.endsWith('_m') && Array.isArray(value)) {
        assert.equal(value.length, 2, `${r.id}.${key}`);
        assert.ok(value[0] > 0 && value[0] < value[1], `${r.id}.${key}`);
      }
    if (r.check?.startsWith('track3d.')) assert.ok(r.requires?.includes('track_id'), r.id);
    if (r.params?.frame === 'global') assert.ok(r.requires?.includes('pose'), r.id);
  }
});
