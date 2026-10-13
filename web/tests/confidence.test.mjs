import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDataset, ENGINE_VERSION, LATEST_ENGINE_VERSION } from '../core/risk/engine.mjs';
import {
  LOW_CONFIDENCE,
  LOW_SCORE_RANGE,
  DROP_SCORE_RANGE,
} from '../core/risk/checks/confidence.mjs';

const latest = { engineVersion: LATEST_ENGINE_VERSION };
const MIN_QUEUE_SCORE = 30;

// A plain image dataset: no track_id, so every temporal check skips. This is the
// BDD100K detection / COCO / CVAT-images shape.
const image = (confidences) => ({
  schema_version: '1.0.0',
  dataset: { id: 'conf', name: 'confidence' },
  media: [{ id: 'm', type: 'image', name: 'street.png', width: 800, height: 480 }],
  frames: [{ id: 'f0', media_id: 'm', index: 0 }],
  annotations: confidences.map((confidence, i) => ({
    id: `a${i}`,
    frame_id: 'f0',
    label: 'car',
    geometry: { type: 'bbox', x: 20 + i * 150, y: 100, width: 120, height: 90 },
    ...(confidence === undefined ? {} : { confidence }),
  })),
});

// Three observations of one track, so neighbour_drop can run.
const track = (confidences) => ({
  schema_version: '1.0.0',
  dataset: { id: 'conf-track', name: 'confidence track' },
  media: [{ id: 'v', type: 'video', name: 'clip.mp4', width: 800, height: 480 }],
  frames: confidences.map((_, i) => ({ id: `f${i}`, media_id: 'v', index: i })),
  annotations: confidences.map((confidence, i) => ({
    id: `t${i}`,
    frame_id: `f${i}`,
    label: 'car',
    track_id: 'track-1',
    geometry: { type: 'bbox', x: 100 + i * 5, y: 100, width: 120, height: 90 },
    confidence,
  })),
});

const scoreOf = (report, id) => report.results.find((r) => r.id === id).score;
const evaluationOf = (report, id, check) =>
  report.results.find((r) => r.id === id).evaluations.find((e) => e.check_id === check);

test('a consistently unsure prediction becomes a case on its own', () => {
  // The exact gap: confidence 0.27 at every frame has no neighbour drop, so
  // before 2.2.0 this scored 0 and never reached a reviewer.
  const data = image([0.27]);
  assert.equal(analyzeDataset(data).cases.length, 0, 'profile 2.0.0 must be unchanged');
  const report = analyzeDataset(data, latest);
  assert.equal(report.cases.length, 1);
  assert.ok(scoreOf(report, 'a0') >= MIN_QUEUE_SCORE);
  assert.equal(evaluationOf(report, 'a0', 'confidence.low').status, 'flagged');
});

test('low-confidence score scales and is floored at the queue threshold', () => {
  const report = analyzeDataset(image([0.49, 0.25, 0]), latest);
  const [floor, ceiling] = LOW_SCORE_RANGE;
  const scores = ['a0', 'a1', 'a2'].map((id) => evaluationOf(report, id, 'confidence.low').score);
  assert.ok(scores[0] >= MIN_QUEUE_SCORE, `${scores[0]} must reach the queue alone`);
  assert.ok(scores[0] < scores[1] && scores[1] < scores[2], `not monotonic: ${scores}`);
  assert.equal(scores[2], ceiling);
  assert.ok(scores[0] >= floor);
});

test('confidence at or above the threshold passes', () => {
  const report = analyzeDataset(image([LOW_CONFIDENCE, 0.9]), latest);
  assert.equal(report.cases.length, 0);
  assert.equal(evaluationOf(report, 'a0', 'confidence.low').status, 'passed');
});

test('missing confidence skips instead of counting as zero', () => {
  const report = analyzeDataset(image([undefined]), latest);
  const evaluation = evaluationOf(report, 'a0', 'confidence.low');
  assert.equal(evaluation.status, 'skipped');
  assert.equal(evaluation.reason, 'missing_confidence');
  assert.equal(report.cases.length, 0);
  assert.equal(report.checks['confidence.low'].skipped, 1);
});

test('neighbour drop alone now reaches the queue, and scales with the drop', () => {
  const mild = analyzeDataset(track([0.95, 0.7, 0.95]), latest);
  const severe = analyzeDataset(track([0.95, 0.1, 0.95]), latest);
  const mildScore = evaluationOf(mild, 't1', 'confidence.neighbor_drop').score;
  const severeScore = evaluationOf(severe, 't1', 'confidence.neighbor_drop').score;
  assert.ok(mildScore >= MIN_QUEUE_SCORE, `${mildScore} must reach the queue alone`);
  assert.ok(severeScore > mildScore);
  assert.ok(severeScore <= DROP_SCORE_RANGE[1]);
  // 0.7 is above LOW_CONFIDENCE, so this case is driven by the drop alone.
  assert.equal(evaluationOf(mild, 't1', 'confidence.low').status, 'passed');
  assert.ok(mild.cases.some((c) => c.id === 't1'));
});

test('profile 2.0.0 keeps the frozen neighbour-drop score of 20', () => {
  const report = analyzeDataset(track([0.95, 0.1, 0.95]), { engineVersion: ENGINE_VERSION });
  const evaluation = evaluationOf(report, 't1', 'confidence.neighbor_drop');
  assert.equal(evaluation.score, 20);
  assert.equal(evaluation.check_version, '1.0.0');
  assert.equal(report.cases.length, 0, '20 alone stays below the queue threshold');
});
