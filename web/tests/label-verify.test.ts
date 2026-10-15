import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifierReport, verifierRequest } from '../core/risk/label-verify.ts';

// The verifier's model lives outside this repo; these tests hold what is sent to it and how
// policy/_verifier.json scores what it answers.
const policy = JSON.parse(
  readFileSync(new URL('../policy/_verifier.json', import.meta.url), 'utf8'),
).verifier_policy;
const box = (id: string, label: string, width = 60, height = 120): any => ({
  id,
  frame_id: 'f0',
  label,
  geometry: { type: 'bbox', x: 10, y: 20, width, height },
});
const scene = (annotations: any[]): any => ({
  schema_version: '1.0.0',
  dataset: { id: 'scene', name: 'scene' },
  media: [{ id: 'm', name: 'm.jpg', type: 'image', width: 1280, height: 720 }],
  frames: [{ id: 'f0', media_id: 'm', index: 0, image: 'images/m.jpg' }],
  annotations,
});
const answer = (results: any[]): any => ({ model: 'test', results, skipped: [] });

test('the request carries the policy’s captions and every box the model can judge', () => {
  const data = scene([
    box('a', 'car'),
    box('b', 'Motorcycle'),
    box('small', 'person', 10, 20),
    box('other', 'umbrella'),
    { ...box('poly', 'car'), geometry: { type: 'polygon', points: [] } },
  ]);
  const { request, skipped } = verifierRequest(data, (frame) => `/data/${frame.image}`);
  assert.equal(request.model, policy.model);
  assert.equal(request.margin, policy.crop.margin);
  assert.equal(request.shape, policy.crop.shape);
  assert.equal(request.pool, policy.pool);
  assert.deepEqual(request.labels.car, policy.captions.car);
  assert.ok(!('note' in request.labels));
  assert.deepEqual(request.boxes, [
    { id: 'a', image: '/data/images/m.jpg', x: 10, y: 20, width: 60, height: 120 },
    { id: 'b', image: '/data/images/m.jpg', x: 10, y: 20, width: 60, height: 120 },
  ]);
  assert.deepEqual(skipped, [
    { annotation_id: 'small', reason: 'below_minimum_size' },
    { annotation_id: 'other', reason: 'unsupported_label' },
    { annotation_id: 'poly', reason: 'not_a_bbox' },
  ]);
  assert.deepEqual(verifierRequest(data, () => undefined).request.boxes, []);
});

test('a disagreement is scored by the policy’s tiers, not by the model', () => {
  const [high, queue, warning] = policy.findings[0].score_by_lead;
  const scores = (person: number) => ({ car: 1 - person, person });
  const lead = (step: any) => (1 + step.lead_at_least) / 2 + 0.01;
  const data = scene(['high', 'queue', 'warning', 'slight', 'agree'].map((id) => box(id, 'car')));
  const report = verifierReport(
    data,
    answer([
      { id: 'high', scores: scores(lead(high)), caption: 'a photo of a person' },
      { id: 'queue', scores: scores(lead(queue)) },
      { id: 'warning', scores: scores(lead(warning)) },
      { id: 'slight', scores: scores((1 + warning.lead_at_least) / 2 - 0.02) },
      { id: 'agree', scores: scores(0.1) },
    ]),
    [{ annotation_id: 'x', reason: 'unsupported_label' }],
  );
  const by = Object.fromEntries(report.results.map((r) => [r.annotation_id, r]));
  assert.equal(by.high.score, high.score);
  assert.equal(by.high.suggested_label, 'person');
  assert.equal(by.high.rule_id, 'verifier.wrong_label');
  assert.equal(by.high.error_type, 'CLASS');
  assert.match(by.high.reason!, /person/);
  assert.equal(by.queue.score, queue.score);
  assert.deepEqual([by.warning.score, by.warning.level], [0, 'warning']);
  assert.deepEqual([by.slight.score, by.slight.rule_id], [0, undefined]);
  assert.deepEqual([by.agree.predicted, by.agree.lead, by.agree.score], ['car', 0, 0]);
  assert.deepEqual(
    report.cases.map((r) => r.annotation_id),
    ['high', 'queue'],
  );
  assert.deepEqual(
    report.warnings.map((r) => r.annotation_id),
    ['warning'],
  );
  assert.deepEqual(report.skipped, [{ annotation_id: 'x', reason: 'unsupported_label' }]);
});

test('the model is not asked to tell a rider from the two-wheeler under them', () => {
  const data = scene([box('rider', 'person'), box('bike', 'motorcycle')]);
  const report = verifierReport(
    data,
    answer([
      { id: 'rider', scores: { person: 0.05, two_wheeler: 0.9, car: 0.05 } },
      { id: 'bike', scores: { person: 0.9, two_wheeler: 0.02, car: 0.08 } },
    ]),
  );
  assert.deepEqual(
    report.results.map((r) => [r.predicted, r.lead, r.score]),
    [
      ['person', 0, 0],
      ['two_wheeler', 0, 0],
    ],
  );
  // Against any other label the two stand together: the belief the model split is added up.
  const [high] = policy.findings[0].score_by_lead;
  const split = verifierReport(
    scene([box('car', 'car')]),
    answer([{ id: 'car', scores: { person: 0.4, two_wheeler: 0.55, car: 0.05 } }]),
  ).results[0];
  assert.equal(split.predicted, 'two_wheeler');
  assert.ok(Math.abs(split.lead - 0.9) < 1e-9);
  assert.equal(split.score, high.score);
  assert.match(split.reason!, /person hoặc two_wheeler \(95%\)/);
  assert.throws(() => verifierReport(data, answer([{ id: 'ghost', scores: {} }])), /unknown box/);
});
