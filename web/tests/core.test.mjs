import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { normalizeDataset } from '../core/schema/normalize.mjs';
import { importCvatImages } from '../core/importers/cvat-images.mjs';
import { importAnnotations } from '../core/importers/index.mjs';
import { analyzeDataset } from '../core/risk/engine.mjs';

const xml = await fs.readFile(
  new URL('../fixtures/human/annotations.xml', import.meta.url),
  'utf8',
);
const human = () => importCvatImages(xml);
function temporal() {
  const d = human();
  d.media[0].type = 'video';
  d.media[0].frame_count = 3;
  d.frames = [0, 1, 2].map((index) => ({ id: `f${index}`, media_id: d.media[0].id, index }));
  d.annotations = [0, 1, 2].map((i) => ({
    id: `a${i}`,
    frame_id: `f${i}`,
    label: i === 1 ? 'truck' : 'car',
    track_id: 't',
    geometry: { type: 'bbox', x: 10, y: 10, width: 30, height: 30 },
  }));
  return d;
}

test('CVAT human annotation normalizes without confidence or track and flags static geometry', () => {
  const data = human(),
    snapshot = JSON.stringify(data),
    report = analyzeDataset(data);
  assert.equal(data.annotations.length, 4);
  assert.ok(data.annotations.every((a) => !('confidence' in a) && !('track_id' in a)));
  assert.equal(report.cases.length, 2);
  assert.deepEqual(
    report.cases.map((c) => c.score),
    [70, 40],
  );
  assert.equal(report.checks['temporal.class_inconsistency'].skipped, 4);
  assert.equal(report.checks['confidence.neighbor_drop'].skipped, 4);
  assert.equal(JSON.stringify(data), snapshot);
  assert.deepEqual(importAnnotations('smartreview-json', JSON.stringify(data)), data);
});

test('temporal checks work for human tracks without confidence; zero confidence is a valid signal', () => {
  const data = temporal();
  let report = analyzeDataset(data);
  assert.equal(report.cases[0].score, 50);
  assert.equal(
    report.cases[0].evaluations.find((e) => e.check_id === 'confidence.neighbor_drop').reason,
    'missing_confidence',
  );
  data.annotations.forEach((a, i) => (a.confidence = i === 1 ? 0 : 0.8));
  report = analyzeDataset(data);
  assert.equal(report.cases[0].score, 70);
  assert.equal(
    report.cases[0].findings.find((f) => f.check_id === 'confidence.neighbor_drop').evidence
      .values[1],
    0,
  );
});

test('missing neighbors, gaps, and media boundaries skip safely', () => {
  const data = temporal();
  data.media[0].frame_count = 21;
  data.frames[1].index = 10;
  data.frames[2].index = 20;
  assert.equal(analyzeDataset(data).cases.length, 0);
  assert.equal(analyzeDataset(data).results[1].evaluations[0].reason, 'frame_gap_exceeds_3');
  const d = temporal();
  d.media = [0, 1, 2].map((i) => ({ ...d.media[0], id: `m${i}` }));
  d.frames.forEach((f, i) => (f.media_id = `m${i}`));
  assert.equal(analyzeDataset(d).cases.length, 0);
});

test('bbox area and position checks expose numeric evidence independently', () => {
  const data = temporal();
  data.annotations.forEach((a) => (a.label = 'car'));
  data.annotations[1].geometry = { type: 'bbox', x: 180, y: 180, width: 90, height: 90 };
  const report = analyzeDataset(data),
    current = report.results.find((r) => r.id === 'a1');
  assert.deepEqual(current.check_ids, ['geometry.bbox_area', 'geometry.bbox_position']);
  assert.equal(current.score, 30);
  assert.ok(current.findings.every((f) => Number.isFinite(f.evidence.ratio)));
});

test('versioning, schema, duplicate IDs, references and unsafe assets are rejected', () => {
  for (const mutate of [
    (d) => (d.schema_version = '2.0.0'),
    (d) => (d.annotations[0].confidence = 2),
    (d) => (d.annotations[0].geometry.x = Infinity),
    (d) => (d.annotations[1].id = d.annotations[0].id),
    (d) => (d.annotations[0].frame_id = 'missing'),
    (d) => (d.frames[0].image = '../secret.png'),
    (d) => (d.frames[0].image = '/etc/passwd'),
  ]) {
    const d = human();
    mutate(d);
    assert.throws(() => normalizeDataset(d));
  }
  const d = temporal();
  d.annotations.push({ ...d.annotations[0], id: 'another' });
  assert.throws(() => normalizeDataset(d), /Ambiguous track/);
});

test('schema preserves geometry extension types and engine reports unsupported checks', () => {
  const d = human();
  d.annotations = [
    {
      ...d.annotations[0],
      geometry: {
        type: 'polygon',
        points: [
          [0, 0],
          [20, 0],
          [20, 20],
        ],
      },
    },
    {
      ...d.annotations[1],
      geometry: {
        type: 'polyline',
        points: [
          [0, 0],
          [20, 20],
        ],
      },
    },
    {
      ...d.annotations[2],
      geometry: { type: 'mask', encoding: 'rle', size: [480, 800], counts: [384000] },
    },
    {
      ...d.annotations[3],
      geometry: {
        type: 'cuboid',
        center: [0, 0, 0],
        size: [1, 2, 3],
        rotation: [0, 0, 0],
        coordinate_system: 'camera',
      },
    },
  ];
  assert.deepEqual(normalizeDataset(d), d);
  const report = analyzeDataset(d);
  assert.equal(report.cases.length, 0);
  assert.equal(report.checks['geometry.bbox_validity'].skip_reasons.unsupported_geometry, 4);
});

test('CVAT importer rejects unsupported content rather than silently discarding annotations', () => {
  assert.throws(
    () => importCvatImages(xml.replace('<image', '<track id="1" label="car"/><image')),
    /video tracks/,
  );
  assert.throws(
    () => importCvatImages(xml.replace('</image>', '<mask label="car"/></image>')),
    /Unsupported/,
  );
  assert.throws(
    () => importCvatImages(xml.replace('xtl="585"', 'rotation="30" xtl="585"')),
    /Rotated/,
  );
  assert.throws(() => importCvatImages('<!DOCTYPE data>' + xml), /DTD/);
  assert.throws(() => importAnnotations('coco', '{}'), /Unsupported importer/);
});
