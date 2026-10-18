import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_SCORE_MODEL,
  SCORE_MODELS,
  findScoreModel,
  listScoreModels,
  rescoreDataset,
  scoreSettings,
} from '../server/ai/rescore.ts';

// A Model_rescore folder holding the given files.
async function folder(files: string[]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rescore-models-'));
  for (const file of files) await fs.writeFile(path.join(root, file), '');
  return root;
}

test('yolo26s fine-tune keeps its measured scorer numbers', () => {
  const entry = SCORE_MODELS.find((m) => m.id === 'yolo26s');
  assert.ok(entry, 'SCORE_MODELS has yolo26s');
  assert.equal(entry.file, 'yolo26s.pt');
  // The pinned scorer numbers travel to the worker and the dataset metadata: its own
  // calibration (threshold_lock.json), training pixels, blind labels, and the measured
  // rescore floor (broken-box: AUROC 0.9505).
  assert.deepEqual(scoreSettings(entry), {
    entry,
    missing: 0.3055,
    imgsz: 960,
    blind: ['train'],
    rescoreFloor: 0.02,
  });
  // Stock models keep the shared defaults and no pinned floor.
  const s = scoreSettings(SCORE_MODELS.find((m) => m.id === 'yolo11s')!);
  assert.equal(s.missing, 0.4);
  assert.equal(s.imgsz, 1280);
  assert.deepEqual(s.blind, []);
  assert.equal(s.rescoreFloor, undefined);
  assert.equal(DEFAULT_SCORE_MODEL, 'yolo11s');
});

test('the popup lists only the .pt files of the folder, known ones with their details', async () => {
  const root = await folder([
    'yolo26s.pt',
    'yolo11s.pt',
    'my-detector.pt',
    'notes.txt',
    '.hidden.pt',
  ]);
  const models = await listScoreModels(root);
  assert.deepEqual(
    models.map((m) => [m.id, m.default]),
    [
      ['my-detector', false],
      ['yolo11s', true],
      ['yolo26s', false],
    ],
  );
  assert.equal(models[2].name, 'YOLO26s fine-tune');
  // A model outside the catalogue is offered with the shared defaults.
  assert.equal(models[0].name, 'my-detector');
  assert.deepEqual(scoreSettings(models[0]).missing, 0.4);
  assert.deepEqual(await listScoreModels(path.join(root, 'missing')), []);
  assert.equal((await findScoreModel('yolo26s', root)).file, path.join(root, 'yolo26s.pt'));
  // A catalogue model whose file is not in the folder cannot be picked.
  await assert.rejects(findScoreModel('yolo11m', root), /Không có model chấm điểm/);
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
