import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport3D, judge, metrics3D, returnRound } from '../server/projects3d/handoff.ts';

// Three frames; a car in all of them, a pedestrian in the last two.
const box = (id: string, type: string) => ({
  id,
  type,
  center: [0, 0, 0],
  size: [1, 1, 1],
  heading: 0,
});
const scene: any = {
  segment: 'seg-1',
  frames: [
    { timestamp: 100, pose: [], boxes: [box('car', 'VEHICLE')] },
    { timestamp: 200, pose: [], boxes: [box('car', 'VEHICLE'), box('ped', 'PEDESTRIAN')] },
    { timestamp: 300, pose: [], boxes: [box('car', 'VEHICLE'), box('ped', 'PEDESTRIAN')] },
  ],
};
const review = (decision: string, over: object = {}): any => ({
  decision,
  error_type: decision === 'ERROR' ? 'BBOX' : null,
  corrected_value: null,
  note: null,
  version: 1,
  reviewed_at: '2026-10-18T00:00:00Z',
  ...over,
});
const risk: any = {
  cases: [
    {
      id: '200:ped',
      timestamp: 200,
      object_id: 'ped',
      type: 'PEDESTRIAN',
      score: 60,
      reasons: ['Cuboid lơ lửng'],
    },
    {
      id: '300:ped',
      timestamp: 300,
      object_id: 'ped',
      type: 'PEDESTRIAN',
      score: 40,
      reasons: ['Nhỏ'],
    },
  ],
};
const reviews = {
  // The car reviewed as a whole object: one item over its three frames.
  '100:car': review('ERROR', { note: 'Lệch hướng' }),
  '200:car': review('ERROR', { note: 'Lệch hướng' }),
  '300:car': review('ERROR', { note: 'Lệch hướng' }),
  '200:ped': review('UNSURE'),
  // A key of a frame the scene does not have is left out.
  '999:car': review('ERROR'),
};
const project = { id: 'p', name: 'P' };

test('the report groups the frames of one object under one item, errors apart from the rest', () => {
  const report = buildReport3D(project, 'rev', scene, reviews, risk);
  assert.equal(report.segment, 'seg-1');
  assert.equal(report.errors.length, 1);
  assert.deepEqual(
    { ...report.errors[0] },
    {
      id: '100:car',
      object_id: 'car',
      type: 'VEHICLE',
      frames: [0, 1, 2],
      keys: ['100:car', '200:car', '300:car'],
      status: 'ERROR',
      error_type: 'BBOX',
      corrected_value: null,
      note: 'Lệch hướng',
      score: 0,
      reasons: [],
    },
  );
  assert.deepEqual(report.review, []);
  // With the items to look at again: the unsure pedestrian and its unreviewed case.
  const full = buildReport3D(project, 'rev', scene, reviews, risk, { review: true });
  assert.deepEqual(
    full.review.map((i) => [i.id, i.status, i.frames, i.score]),
    [
      ['200:ped', 'UNSURE', [1], 60],
      ['300:ped', 'UNREVIEWED', [2], 40],
    ],
  );
  assert.deepEqual(metrics3D(reviews, risk), { confirmed_errors: 4, unsure: 1, unreviewed: 1 });
});

test('the annotator says which items are fixed; the reviewer judges each one', () => {
  const report = buildReport3D(project, 'rev', scene, reviews, risk, { review: true });
  const result = returnRound(report, {
    fixed: ['100:car'],
    answers: { '200:ped': 'Không thấy lỗi', '300:ped': '  ' },
    note: 'Xong',
  });
  assert.equal(result.note, 'Xong');
  assert.deepEqual(
    [...result.errors, ...result.review].map((i) => [i.id, i.fixed, i.answer]),
    [
      ['100:car', true, null],
      ['200:ped', false, 'Không thấy lỗi'],
      ['300:ped', false, null],
    ],
  );
  assert.throws(() => returnRound(report, { fixed: ['nope'] }), /không thuộc lượt gửi/);
  assert.throws(() => returnRound(report, { fixed: 'all' }), /danh sách id/);

  const accepted = judge(result, { id: '100:car', value: 'accept' }, 'rev1');
  assert.equal(accepted.errors[0].verdict?.value, 'accept');
  assert.equal(accepted.errors[0].verdict?.by, 'rev1');
  const cleared = judge(accepted, { id: '100:car', value: null }, 'rev1');
  assert.equal('verdict' in cleared.errors[0], false);
  assert.throws(() => judge(result, { id: 'x', value: 'accept' }, 'rev1'), /Không có mục này/);
  assert.throws(() => judge(result, { id: '100:car', value: 'maybe' }, 'rev1'), /value phải là/);
});
