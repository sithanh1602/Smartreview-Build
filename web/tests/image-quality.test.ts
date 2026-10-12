import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { importCvatImages } from '../core/importers/cvat-images.ts';
import {
  analyzeDataset,
  checksFor,
  ENGINE_VERSION,
  LATEST_ENGINE_VERSION,
} from '../core/risk_v1/engine.ts';

const xml = await fs.readFile(
  new URL('../fixtures/human/annotations.xml', import.meta.url),
  'utf8',
);
// One image frame holding exactly the boxes given; media size comes from the fixture.
function dataset(boxes) {
  const d = importCvatImages(xml);
  d.frames = [{ id: 'f0', media_id: d.media[0].id, index: 0 }];
  d.annotations = boxes.map(([id, label, x, y, width, height]) => ({
    id,
    frame_id: 'f0',
    label,
    geometry: { type: 'bbox', x, y, width, height },
  }));
  return d;
}
const latest = { engineVersion: LATEST_ENGINE_VERSION };
const flagged = (report, id, check) =>
  report.results.find((r) => r.id === id).findings.find((f) => f.check_id === check);

test('default engine profile is unchanged; the new checks only exist in the latest profile', () => {
  const d = dataset([['a', 'car', 10, 10, 100, 100]]);
  const old = analyzeDataset(d);
  assert.equal(ENGINE_VERSION, '2.0.0');
  assert.equal(old.engine_version, '2.0.0');
  assert.deepEqual(Object.keys(old.checks), [
    'temporal.class_inconsistency',
    'confidence.neighbor_drop',
    'geometry.bbox_validity',
    'geometry.bbox_area',
    'geometry.bbox_position',
  ]);
  const next = analyzeDataset(d, latest);
  assert.equal(next.engine_version, '2.1.0');
  assert.equal(Object.keys(next.checks).length, 9);
  assert.throws(() => checksFor('9.9.9'), /Unknown engine version/);
});

test('duplicate boxes flag only the later annotation of the pair', () => {
  const report = analyzeDataset(
    dataset([
      ['a1', 'car', 10, 10, 100, 100],
      ['a2', 'car', 12, 12, 100, 100],
      ['far', 'car', 400, 300, 100, 100],
    ]),
    latest,
  );
  assert.equal(flagged(report, 'a1', 'geometry.bbox_duplicate'), undefined);
  const f = flagged(report, 'a2', 'geometry.bbox_duplicate');
  assert.equal(f.score, 50);
  assert.deepEqual(f.evidence.annotation_ids, ['a1', 'a2']);
  assert.equal(flagged(report, 'far', 'geometry.bbox_duplicate'), undefined);
  assert.deepEqual(
    report.cases.map((c) => c.id),
    ['a2'],
  );
});

test('identical box with a different label is reported as a label conflict', () => {
  const report = analyzeDataset(
    dataset([
      ['a1', 'car', 10, 10, 100, 100],
      ['a2', 'truck', 10, 10, 100, 100],
    ]),
    latest,
  );
  const f = flagged(report, 'a2', 'geometry.bbox_duplicate');
  assert.equal(f.score, 45);
  assert.equal(f.evidence.same_label, false);
});

test('tiny boxes become cases; extreme aspect ratio only adds supporting evidence', () => {
  const report = analyzeDataset(
    dataset([
      ['tiny', 'car', 10, 10, 2, 2],
      ['thin', 'car', 100, 100, 400, 10],
      ['ok', 'car', 100, 300, 80, 60],
    ]),
    latest,
  );
  assert.equal(flagged(report, 'tiny', 'geometry.bbox_tiny').score, 35);
  assert.equal(flagged(report, 'thin', 'geometry.bbox_aspect').score, 25);
  assert.deepEqual(
    report.cases.map((c) => c.id),
    ['tiny'],
  );
  assert.equal(flagged(report, 'ok', 'geometry.bbox_tiny'), undefined);
});

test('size outlier needs enough samples of the same label', () => {
  const grid = (n) =>
    Array.from({ length: n }, (_, i) => [
      `c${i}`,
      'car',
      (i % 10) * 70 + 5,
      Math.floor(i / 10) * 60 + 5,
      60,
      40,
    ]);
  const many = analyzeDataset(dataset([...grid(25), ['huge', 'car', 5, 150, 700, 300]]), latest);
  const f = flagged(many, 'huge', 'geometry.bbox_size_outlier');
  assert.ok(f.evidence.z >= 4);
  assert.equal(f.evidence.label_samples, 26);
  assert.equal(flagged(many, 'c0', 'geometry.bbox_size_outlier'), undefined);
  const few = analyzeDataset(dataset([...grid(5), ['huge', 'car', 5, 150, 700, 300]]), latest);
  assert.equal(few.checks['geometry.bbox_size_outlier'].skip_reasons.insufficient_label_samples, 6);
  assert.equal(flagged(few, 'huge', 'geometry.bbox_size_outlier'), undefined);
});

test('new checks skip non-bbox geometry instead of failing', () => {
  const d = dataset([['a', 'car', 10, 10, 50, 50]]);
  d.annotations[0].geometry = {
    type: 'polygon',
    points: [
      [0, 0],
      [20, 0],
      [20, 20],
    ],
  };
  const report = analyzeDataset(d, latest);
  for (const id of [
    'geometry.bbox_duplicate',
    'geometry.bbox_tiny',
    'geometry.bbox_aspect',
    'geometry.bbox_size_outlier',
  ])
    assert.equal(report.checks[id].skip_reasons.unsupported_geometry, 1);
  assert.equal(report.cases.length, 0);
});
