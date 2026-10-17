import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCORE_MODEL, SCORE_MODELS, listScoreModels, rescoreDataset, scoreSettings } from '../server/ai/rescore.ts';

test('yolo26s fine-tune is offered as a score model, never auto-downloaded', () => {
  const entry = SCORE_MODELS.find((m) => m.id === 'yolo26s');
  assert.ok(entry, 'SCORE_MODELS has yolo26s');
  assert.equal(entry.file, 'yolo26s.pt');
  assert.equal('localOnly' in entry && entry.localOnly, true);
  // The pinned scorer numbers travel to the worker and the dataset metadata: its own
  // calibration (threshold_lock.json), training pixels, blind labels, and the measured
  // rescore floor (broken-box: AUROC 0.9505).
  assert.deepEqual(scoreSettings('yolo26s'), {
    entry,
    missing: 0.3055,
    imgsz: 960,
    blind: ['train'],
    rescoreFloor: 0.02,
  });
  // Stock models keep the shared defaults and no pinned floor.
  const s = scoreSettings('yolo11s');
  assert.equal(s.missing, 0.4);
  assert.equal(s.imgsz, 1280);
  assert.deepEqual(s.blind, []);
  assert.equal(s.rescoreFloor, undefined);
  assert.equal(DEFAULT_SCORE_MODEL, 'yolo11s');
});

test('the import dialog lists yolo26s next to the downloadable models', async () => {
  const models = await listScoreModels();
  const ids = models.map((m) => m.id);
  assert.ok(ids.includes('yolo26s'), `expected yolo26s in ${ids.join(',')}`);
  for (const m of models) assert.equal(typeof m.installed, 'boolean');
});

test('an unknown score model id is rejected before any image is read', async () => {
  await assert.rejects(
    rescoreDataset(
      {} as Parameters<typeof rescoreDataset>[0],
      new Map(),
      '/tmp',
      () => {},
      'khong-co-model-nay',
    ),
    /Không có model chấm điểm/,
  );
});
