import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { importAnnotations } from '../core/importers/index.ts';
import {
  applyEnvRisk,
  locateSignals,
  parseImageTable,
  readSignals,
  signalOf,
} from '../core/importers/signals.ts';
import { analyzeDataset } from '../core/risk/engine.ts';

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

test('signals are found at any depth; the nearest usable field wins', () => {
  for (const [source, expected] of [
    [{ attributes: { model: { Score: '0.7' } } }, 0.7],
    [{ score: 0.4, attributes: { score: 0.9 } }, 0.4],
    [{ score: 'high', meta: { detection: { conf: 0.2 } } }, 0.2],
    [{ candidates: [{ score: 0.1 }] }, undefined],
    [{ top2: { label: 'truck', score: 0.4 } }, undefined],
    [{ a: { b: { c: { d: { e: { score: 0.5 } } } } } }, undefined],
  ])
    assert.equal(readSignals(source).confidence, expected, JSON.stringify(source));
  assert.deepEqual(
    readSignals({ prediction: { confidence: 0.8, top2: { class: 'bus', prob: '30%' } } }),
    { confidence: 0.8, top2: { label_top2: 'bus', score_top2: 0.3 } },
  );
  assert.deepEqual(readSignals({ labelTop2: 'bus', top2Score: 0.3 }).top2, {
    label_top2: 'bus',
    score_top2: 0.3,
  });
  assert.equal(
    locateSignals({ attributes: { model: { score: 0.7 } } }).confidence.path,
    'attributes.model.score',
  );
  assert.equal(signalOf('Top2-Score'), 'top2_score');
});

test('CVAT, COCO and SmartReview JSON importers carry score, top-2 and env_risk', () => {
  const xml = importAnnotations(
    'cvat-images',
    cvat(
      '<attribute name="score">0.48</attribute><attribute name="label_top2">bus</attribute><attribute name="score_top2">0.40</attribute>',
    ),
  );
  assert.equal(xml.annotations[0].confidence, 0.48);
  assert.equal(xml.annotations[0].attributes.score_top2, 0.4);
  assert.equal(xml.annotations[0].attributes.score, '0.48');
  assert.equal(analyzeDataset(xml).results[0].score, 80);
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
  // Without the table the box is only a low confidence; the poor image is what the table adds.
  assert.deepEqual(analyzeDataset(data).results[0].check_ids, ['confidence.low_score']);
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

test('a rescore of a box a person drew is its own signal, judged on its own scale', () => {
  assert.equal(signalOf('rescore'), 'rescore');
  const drawn = (value) =>
    importAnnotations(
      'cvat-images',
      cvat(`<attribute name="rescore">${value}</attribute>`).replace(
        'source="auto"',
        'source="manual"',
      ),
    );
  const low = drawn('0.0100');
  // Not a confidence: the box stays the person's, and the set is not model output.
  assert.equal(low.annotations[0].confidence, undefined);
  assert.equal(low.annotations[0].attributes.rescore, 0.01);
  const report = analyzeDataset(low);
  assert.equal(report.results[0].state, 'manual');
  assert.deepEqual(report.results[0].check_ids, ['confidence.rescore_low']);
  assert.equal(report.results[0].score, 30);
  assert.equal(report.frames[0].tier, 'verify');
  // A right box often scores far below a draft's 0.5; 0.2 is no finding and no grey zone.
  const fine = analyzeDataset(drawn('0.2000'));
  assert.deepEqual(fine.results[0].check_ids, []);
  assert.equal(fine.frames[0].tier, 'auto_accept');
  assert.deepEqual(fine.frames[0].image_rules, []);
  // The model can hardly judge a box under 16 px: a low rescore there only warns.
  const tiny = analyzeDataset(
    importAnnotations(
      'cvat-images',
      cvat('<attribute name="rescore">0.001</attribute>')
        .replace('source="auto"', 'source="manual"')
        .replace('xbr="680" ybr="480"', 'xbr="512" ybr="372"'),
    ),
  );
  assert.equal(tiny.results[0].score, 0);
  assert.deepEqual(tiny.warning_cases[0].check_ids, ['confidence.rescore_low']);
  assert.equal(tiny.frames[0].tier, 'auto_accept');
  // 7.0.0 does not read it.
  assert.deepEqual(analyzeDataset(low, { engineVersion: '7.0.0' }).results[0].check_ids, []);

  const input = structuredClone(coco);
  input.annotations[0].rescore = 0.005;
  const json = importAnnotations('coco-detection', JSON.stringify(input));
  assert.equal(json.annotations[0].confidence, undefined);
  assert.equal(json.annotations[0].attributes.rescore, 0.005);
});

test('objects the model found that nobody drew keep a frame out of auto_accept', () => {
  const hint = (frame, label, score, at = 'xtl="100" ytl="100" xbr="200" ybr="180"') =>
    `<object ${frame} label="${label}" score="${score}" ${at} />`;
  const withHints = (xml, objects) =>
    xml.replace(
      '<version>1.1</version>',
      `<version>1.1</version><meta><smartreview_missing>${objects}</smartreview_missing></meta>`,
    );
  const drawn = cvat('<attribute name="rescore">0.5</attribute>').replace(
    'source="auto"',
    'source="manual"',
  );
  const data = importAnnotations(
    'cvat-images',
    withHints(
      drawn,
      hint('image_id="1"', 'car', '0.62') +
        hint('image_id="1"', 'person', '0.35') +
        hint('image_id="1"', 'traffic light', '0.9'),
    ),
  );
  assert.equal(data.dataset.metadata.missing_hints['image-1:0'].length, 3);
  const frame = analyzeDataset(data).frames[0];
  // Only the core object at 0.4 or above counts; the box drawn by a person is still judged as one.
  assert.equal(frame.tier, 'verify');
  assert.deepEqual(
    frame.image_rules.map((r) => r.rule_id),
    ['coverage.model_missing'],
  );
  assert.equal(frame.image_rules[0].evidence.missing, 1);
  assert.equal(frame.image_rules[0].evidence.objects[0].label, 'car');
  assert.equal(analyzeDataset(data, { engineVersion: '7.0.0' }).frames[0].tier, 'auto_accept');

  // A flagged box of the same label beside the object is that object drawn in the wrong place:
  // its own case reports it, so the object is not reported again as missing.
  const shifted = analyzeDataset(
    importAnnotations(
      'cvat-images',
      withHints(
        cvat('<attribute name="rescore">0.001</attribute>').replace(
          'source="auto"',
          'source="manual"',
        ),
        hint('image_id="1"', 'car', '0.7', 'xtl="580" ytl="410" xbr="760" ybr="530"'),
      ),
    ),
  ).frames[0];
  assert.deepEqual(shifted.image_rules, []);
  assert.equal(shifted.tier, 'verify');

  // In a video a frame nobody drew on becomes a frame when the model found an object in it.
  const video = importAnnotations(
    'cvat-video',
    `<annotations><version>1.1</version><meta>
      <task><name>v</name><original_size><width>1280</width><height>720</height></original_size></task>
      <smartreview_missing>${hint('frame="3"', 'car', '0.8')}</smartreview_missing></meta>
      <track id="0" label="car" source="manual">
        <box frame="0" xtl="500" ytl="360" xbr="680" ybr="480" outside="0" occluded="0" keyframe="1" />
      </track></annotations>`,
  );
  assert.deepEqual(
    video.frames.map((f) => f.id),
    ['video:0', 'video:3'],
  );
  assert.deepEqual(
    analyzeDataset(video).frames.map((f) => f.tier),
    ['auto_accept', 'verify'],
  );

  const input = structuredClone(coco);
  input.smartreview_missing = [
    { image_id: 7, category_id: input.categories[0].id, score: 0.7, bbox: [10, 10, 80, 60] },
  ];
  const json = importAnnotations('coco-detection', JSON.stringify(input));
  assert.equal(json.dataset.metadata.missing_hints['image-7:0'][0].label, input.categories[0].name);
});
