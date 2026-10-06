import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { comparePredictions, iou } from '../core/risk/ai-compare.mjs';
import { AiService } from '../server/ai/service.mjs';
import { handleProjects } from '../server/projects/http.mjs';
const box = (x = 0) => ({ type: 'bbox', x, y: 0, width: 100, height: 100 });
const annotation = (id = 'a', label = 'car', x = 0) => ({
  id,
  frame_id: 'f',
  label,
  geometry: box(x),
});
const prediction = (label = 'car', x = 0, confidence = 0.9) => ({
  frame_id: 'f',
  label,
  confidence,
  geometry: box(x),
});
const dataset = (annotations = [annotation()]) => ({
  frames: [{ id: 'f' }],
  annotations,
});
test('AI matches class disagreement without confidence or tracks on annotation', () => {
  const data = dataset(),
    before = structuredClone(data);
  const result = comparePredictions(data, [prediction('truck')], ['car', 'truck']);
  assert.equal(result.findings[0].check_id, 'ai.class_disagreement');
  assert.equal(result.findings[0].score, 70);
  assert.deepEqual(data, before);
});
test('IoU and same-label position disagreement', () => {
  assert.equal(iou(box(), box()), 1);
  assert.equal(iou(box(), box(100)), 0);
  assert.equal(
    comparePredictions(dataset(), [prediction('car', 50)], ['car']).findings[0].check_id,
    'ai.bbox_disagreement',
  );
  assert.equal(
    comparePredictions(dataset(), [prediction('truck', 50)], ['car', 'truck']).findings.length,
    0,
  );
});
test('agreement, low confidence, invalid output and unsupported labels are not errors', () => {
  assert.equal(comparePredictions(dataset(), [prediction()], ['car']).findings.length, 0);
  const r = comparePredictions(
    dataset([annotation('a', 'custom'), annotation('b')]),
    [prediction('truck', 0, 0.4), { ...prediction(), confidence: 2 }],
    ['car', 'truck'],
  );
  assert.equal(r.findings.length, 0);
  assert.equal(r.skipped.unsupported_label, 1);
  assert.equal(r.skipped.no_matching_prediction, 1);
});
test('one prediction cannot flag multiple annotations; frames stay isolated', () => {
  const r = comparePredictions(
    dataset([annotation('a'), annotation('b')]),
    [prediction('truck'), { ...prediction('truck'), frame_id: 'other' }],
    ['car', 'truck'],
  );
  assert.equal(r.findings.length, 1);
  assert.equal(r.skipped.no_matching_prediction, 1);
});
test('AI job persists result, rejects overlapping runs, detects restart and revision changes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smartreview-ai-test-'));
  try {
    const model = path.join(root, 'model.pt');
    await fs.writeFile(model, 'test');
    const python = path.join(root, 'worker');
    await fs.writeFile(
      python,
      `#!/usr/bin/env node\nsetTimeout(()=>{require('fs').writeFileSync(process.argv[5],JSON.stringify({predictions:[${JSON.stringify(prediction('truck'))}],labels:['car','truck'],model:{name:'test-only'}}));console.log(JSON.stringify({completed:1}));},100);\n`,
      { mode: 0o755 },
    );
    const d = {
      normalized: dataset(),
      assets: new Map([['f', '/test.jpg']]),
      allCases: [{ id: 'a' }],
      meta: { dataset_id: 'rev' },
    };
    const projects = {
      storageRoot: root,
      context: async () => ({ dataset: d }),
    };
    const service = new AiService(projects, { python, model });
    assert.equal((await service.start('project')).status, 'RUNNING');
    await assert.rejects(
      () => service.start('project'),
      (e) => e.status === 409,
    );
    let state;
    for (let i = 0; i < 100; i++) {
      state = await service.status('project');
      if (state.status !== 'RUNNING') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(state.status, 'READY', state.error);
    assert.equal(state.findings.length, 1);
    assert.equal(
      (await new AiService(projects, { python, model }).status('project')).status,
      'READY',
    );
    await service.persist('project', {
      status: 'RUNNING',
      dataset_revision: 'rev',
    });
    assert.equal((await service.status('project')).status, 'FAILED');
    d.meta.dataset_id = 'changed';
    assert.equal((await service.status('project')).status, 'IDLE');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test('AI routes reject cross-origin writes and unsupported methods', async () => {
  const url = new URL('http://localhost/api/projects/abc/ai-check');
  const projects = {
    ai: {
      start: () => {
        throw Error('must not run');
      },
    },
  };
  await assert.rejects(
    () =>
      handleProjects(
        {
          method: 'POST',
          headers: { host: 'localhost', origin: 'http://evil.example' },
        },
        {},
        url,
        { projects },
      ),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => handleProjects({ method: 'DELETE', headers: {} }, {}, url, { projects }),
    (e) => e.status === 405,
  );
});

// Regression: person and couch overlap; the higher couch IoU is not a class error.
test('reliable same-label match wins over overlapping different-label annotation', () => {
  const couch = annotation('couch', 'couch');
  const person = annotation('person', 'person', 20);
  const result = comparePredictions(
    dataset([couch, person]),
    [prediction('person')],
    ['person', 'couch'],
  );
  assert.equal(result.findings.length, 0);
  assert.equal(result.matched_annotations, 1);
  assert.equal(result.skipped.no_matching_prediction, 1);
});
test('weak same-label overlap does not hide a strong class disagreement', () => {
  const result = comparePredictions(
    dataset([annotation('wrong', 'truck'), annotation('distant', 'car', 60)]),
    [prediction('car')],
    ['car', 'truck'],
  );
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].annotation_id, 'wrong');
  assert.equal(result.findings[0].check_id, 'ai.class_disagreement');
});
