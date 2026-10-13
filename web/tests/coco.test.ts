import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { importAnnotations } from '../core/importers/index.ts';
import { analyzeDataset } from '../core/risk/engine.ts';
const sample = JSON.parse(
  await fs.readFile(new URL('../fixtures/upload/coco.json', import.meta.url), 'utf8'),
);
const convert = (data) =>
  importAnnotations('coco-detection', JSON.stringify(data), {
    id: 'custom',
    name: 'Custom dataset',
  });
test('COCO maps arbitrary category IDs, preserves bbox and metadata, skips optional signals', () => {
  const input = structuredClone(sample);
  input.images.push({ id: 8, file_name: 'nested/empty.png', width: 160, height: 100 });
  input.annotations[0].segmentation = [[145, 40, 175, 40, 175, 80]];
  input.annotations[0].iscrowd = 1;
  const data = convert(input);
  assert.equal(data.dataset.id, 'custom');
  assert.equal(data.frames.length, 2);
  assert.equal(data.frames[1].image, 'images/nested/empty.png');
  const a = data.annotations[0];
  assert.equal(a.label, 'delivery_vehicle');
  assert.deepEqual(a.geometry, { type: 'bbox', x: 145, y: 40, width: 30, height: 40 });
  assert.equal(a.confidence, undefined);
  assert.equal(a.track_id, undefined);
  assert.equal(a.attributes.coco.iscrowd, 1);
  assert.deepEqual(a.attributes.coco.segmentation, input.annotations[0].segmentation);
  assert.equal(analyzeDataset(data).cases[0].score, 40);
  assert.deepEqual(convert(input).annotations, data.annotations);
});
test('COCO rejects duplicate IDs, dangling references, invalid bbox, paths and dimensions', () => {
  const changes = [
    (d) => d.images.push(d.images[0]),
    (d) => d.categories.push(d.categories[0]),
    (d) => d.annotations.push(d.annotations[0]),
    (d) => (d.annotations[0].image_id = 999),
    (d) => (d.annotations[0].category_id = 999),
    (d) => (d.annotations[0].bbox = [1, 2, 3]),
    (d) => (d.annotations[0].bbox = [1, 2, '3', 4]),
    (d) => (d.images[0].width = 0),
    (d) => (d.images[0].file_name = '../secret.png'),
    (d) => (d.images[0].file_name = '/absolute.png'),
    (d) => (d.categories[0].name = ''),
    (d) => (d.annotations[0].id = '100'),
    (d) => d.images.push({ ...d.images[0], id: 8 }),
    (d) => delete d.annotations,
  ];
  for (const change of changes) {
    const d = structuredClone(sample);
    change(d);
    assert.throws(() => convert(d), /COCO/);
  }
  assert.throws(() => convert([]), /COCO/);
});
test('COCO allows empty annotations and keeps invalid geometry for core QA', () => {
  const input = structuredClone(sample);
  input.annotations = [];
  assert.equal(convert(input).annotations.length, 0);
  input.annotations = structuredClone(sample.annotations);
  input.annotations[0].bbox[2] = -5;
  assert.equal(analyzeDataset(convert(input)).cases[0].score, 70);
});
