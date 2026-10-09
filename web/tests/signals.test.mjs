import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { importAnnotations } from '../core/importers/index.mjs';
import { applyEnvRisk, parseImageTable, readSignals } from '../core/importers/signals.mjs';
import { analyzeDataset } from '../core/risk/engine.mjs';

const coco = JSON.parse(
  await fs.readFile(new URL('../fixtures/upload/coco.json', import.meta.url), 'utf8'),
);
const cvat = (attributes) =>
  `<annotations><version>1.1</version><image id="1" name="a.jpg" width="1280" height="720">
  <box label="car" source="auto" xtl="500" ytl="360" xbr="680" ybr="480">${attributes}</box>
  </image></annotations>`;

test('confidence is read under common names and scales, never guessed', () => {
  for (const [source, expected] of [
    [{ confidence: 0.7 }, 0.7],
    [{ score: '0.89106' }, 0.89106],
    [{ Score: ' 0.5 ' }, 0.5],
    [{ scores: [0.2, 0.9, 0.1] }, 0.9],
    [{ conf: 0 }, 0],
    [{ probability: '89%' }, 0.89],
    [{ score: 89 }, undefined],
    [{ score: '' }, undefined],
    [{ score: 'high' }, undefined],
    [{ area: 0.5 }, undefined],
  ])
    assert.equal(readSignals(source).confidence, expected, JSON.stringify(source));
  assert.equal(readSignals({ score: 0.4 }, { score: 0.9 }).confidence, 0.4);
  assert.deepEqual(readSignals({ class_top2: 'truck', top2_score: '0.4' }).top2, {
    label_top2: 'truck',
    score_top2: 0.4,
  });
  assert.equal(readSignals({ label_top2: 'truck' }).top2, undefined);
});

test('CVAT, COCO and SmartReview JSON importers carry score, top-2 and env_risk', () => {
  const xml = importAnnotations(
    'cvat-images',
    cvat(
      '<attribute name="score">0.48</attribute><attribute name="label_top2">truck</attribute><attribute name="score_top2">0.40</attribute>',
    ),
  );
  assert.equal(xml.annotations[0].confidence, 0.48);
  assert.equal(xml.annotations[0].attributes.score_top2, 0.4);
  assert.equal(xml.annotations[0].attributes.score, '0.48');
  assert.equal(analyzeDataset(xml).results[0].score, 70);
  assert.equal(importAnnotations('cvat-images', cvat('')).annotations[0].confidence, undefined);

  const input = structuredClone(coco);
  Object.assign(input.annotations[0], { score: 0.42, attributes: { score: 0.9 } });
  input.images[0].env_risk = 0.8;
  const json = importAnnotations('coco-detection', JSON.stringify(input));
  assert.equal(json.annotations[0].confidence, 0.42);
  assert.deepEqual(json.dataset.metadata.env_risk, { 'image-7:0': 0.8 });

  const native = structuredClone(json);
  delete native.annotations[0].confidence;
  native.annotations[0].attributes = { conf: '0.31' };
  assert.equal(
    importAnnotations('smartreview-json', JSON.stringify(native)).annotations[0].confidence,
    0.31,
  );
  native.annotations[0].confidence = 0.6;
  assert.equal(
    importAnnotations('smartreview-json', JSON.stringify(native)).annotations[0].confidence,
    0.6,
  );
});

test('image table adds env_risk by file name and the poor-condition rule reads it', () => {
  const table = parseImageTable(
    'image_id,file_name,width,env_risk\r\n1,"a.jpg",1280,0.62\n2,other.jpg,1280,0.1\n3,bad.jpg,1280,n/a\n',
  );
  assert.deepEqual(
    [...table],
    [
      ['a.jpg', 0.62],
      ['other.jpg', 0.1],
    ],
  );
  assert.throws(() => parseImageTable('file_name,width\na.jpg,1'), /env_risk/);
  assert.throws(() => parseImageTable('width,env_risk\n1,0.5'), /file_name/);

  const data = importAnnotations(
    'cvat-images',
    cvat('<attribute name="score">0.45</attribute>').replace('a.jpg', 'default/a.jpg'),
  );
  assert.equal(analyzeDataset(data).frames[0].tier, 'auto_accept');
  applyEnvRisk(data, table);
  assert.deepEqual(data.dataset.metadata.env_risk, { 'image-1:0': 0.62 });
  const report = analyzeDataset(data);
  assert.deepEqual(
    report.results[0].findings[0].evidence.signals.map((s) => s.check_id),
    ['confidence.low_score', 'env.poor_condition'],
  );
  assert.equal(report.frames[0].env_risk, 0.62);
});

test('a scored import counts as model output, so an empty frame is not auto-accepted', () => {
  const data = importAnnotations(
    'cvat-images',
    cvat('<attribute name="score">0.9</attribute>').replace(
      '</annotations>',
      '<image id="2" name="b.jpg" width="1280" height="720"></image></annotations>',
    ),
  );
  const frames = analyzeDataset(data).frames;
  assert.deepEqual(
    frames.map((f) => f.tier),
    ['auto_accept', 'verify'],
  );
  assert.equal(frames[1].image_rules[0].rule_id, 'coverage.no_draft_box');
});
