import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { comparePredictions, iou } from '../core/risk/ai-compare.ts';
import { AiService } from '../server/ai/service.ts';
import { handleProjects } from '../server/projects/http.ts';
const box = (x = 0) => ({ type: 'bbox' as const, x, y: 0, width: 100, height: 100 });
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
      deleting: new Set(),
      context: async () => ({ dataset: d }),
    };
    const service = new AiService(projects as any, { python, model });
    assert.equal((await service.start('project')).status, 'RUNNING');
    await assert.rejects(
      () => service.start('project'),
      (e: any) => e.status === 409,
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
      (await new AiService(projects as any, { python, model }).status('project')).status,
      'READY',
    );
    await service.persist('project', {
      status: 'RUNNING',
      dataset_revision: 'rev',
    } as any);
    assert.equal((await service.status('project')).status, 'FAILED');
    d.meta.dataset_id = 'changed';
    assert.equal((await service.status('project')).status, 'IDLE');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test('AI job describes the frame for missing-object findings', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smartreview-ai-missing-'));
  try {
    const model = path.join(root, 'model.pt');
    await fs.writeFile(model, 'test');
    const python = path.join(root, 'worker');
    await fs.writeFile(
      python,
      `#!/usr/bin/env node\nrequire('fs').writeFileSync(process.argv[5],JSON.stringify({predictions:[${JSON.stringify(prediction('car', 500, 0.9))}],labels:['car'],model:{name:'test-only'}}));console.log(JSON.stringify({completed:1}));\n`,
      { mode: 0o755 },
    );
    const d = {
      normalized: {
        frames: [{ id: 'f', media_id: 'm', index: 3 }],
        media: [{ id: 'm', name: 'street.png', width: 800, height: 480 }],
        annotations: [annotation()],
      },
      assets: new Map([['f', '/test.jpg']]),
      allCases: [{ id: 'a' }],
      meta: { dataset_id: 'rev' },
    };
    const projects = {
      storageRoot: root,
      deleting: new Set(),
      context: async () => ({ dataset: d }),
    };
    const service = new AiService(projects as any, { python, model });
    await service.start('project');
    let state;
    for (let i = 0; i < 100; i++) {
      state = await service.status('project');
      if (state.status !== 'RUNNING') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(state.status, 'READY', state.error);
    const [f] = state.findings;
    assert.equal(f.check_id, 'ai.missing_annotation');
    assert.equal(f.observation.media_name, 'street.png');
    assert.equal(f.observation.width, 800);
    assert.equal(f.observation.frame_id, 3);
    assert.equal(f.observation.annotation_id, null);
    assert.equal(f.observation.image_url, '/api/projects/project/assets/f?dataset=rev');
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
        } as any,
        {} as any,
        url,
        { projects } as any,
      ),
    (e: any) => e.status === 403,
  );
  await assert.rejects(
    () =>
      handleProjects({ method: 'DELETE', headers: {} } as any, {} as any, url, { projects } as any),
    (e: any) => e.status === 405,
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

const shape = (id, label, x, y, width, height, frame = 'f') => ({
  id,
  frame_id: frame,
  label,
  geometry: { type: 'bbox' as const, x, y, width, height },
});
const detection = (label, x, y, width, height, confidence = 0.9, frame = 'f') => ({
  frame_id: frame,
  label,
  confidence,
  geometry: { type: 'bbox' as const, x, y, width, height },
});
const scene = (annotations, frames = ['f']) => ({
  frames: frames.map((id) => ({ id })),
  annotations,
});
const missing = (r) => r.findings.filter((f) => f.check_id === 'ai.missing_annotation');
test('confident detection with no annotation is reported as possibly missing', () => {
  const data = scene([shape('a', 'car', 0, 0, 100, 100)]),
    before = structuredClone(data);
  const r = comparePredictions(
    data,
    [detection('car', 0, 0, 100, 100), detection('car', 500, 0, 100, 100, 0.9)],
    ['car', 'person'],
  );
  assert.equal(missing(r).length, 1);
  const [f] = missing(r);
  assert.equal(f.annotation_id, null);
  assert.equal(f.annotation, null);
  assert.equal(f.iou, null);
  assert.equal(f.prediction.geometry.x, 500);
  assert.equal(f.frame_annotations[0].id, 'a');
  assert.equal(f.score, 76);
  assert.deepEqual(data, before);
});
test('missing detection also works on frames with no annotations at all', () => {
  const r = comparePredictions(
    scene([shape('a', 'car', 0, 0, 100, 100)], ['f', 'g']),
    [detection('car', 10, 10, 50, 50, 0.9, 'g')],
    ['car'],
  );
  assert.equal(missing(r).length, 1);
  assert.equal(missing(r)[0].frame_id, 'g');
});
test('missing detection ignores classes absent from the dataset and low confidence', () => {
  const data = scene([shape('a', 'car', 0, 0, 100, 100)]);
  assert.equal(
    missing(comparePredictions(data, [detection('person', 500, 0, 50, 50)], ['car', 'person']))
      .length,
    0,
  );
  assert.equal(
    missing(comparePredictions(data, [detection('car', 500, 0, 50, 50, 0.7)], ['car'])).length,
    0,
  );
});
test('detection inside an existing annotation is not reported (person on a couch)', () => {
  const data = scene([
    shape('couch', 'couch', 0, 0, 400, 400),
    shape('p', 'person', 600, 0, 100, 100),
  ]);
  const r = comparePredictions(
    data,
    [detection('person', 600, 0, 100, 100), detection('person', 50, 50, 100, 100)],
    ['couch', 'person'],
  );
  assert.equal(missing(r).length, 0);
});
test('one object detected under two classes yields one missing suggestion', () => {
  const r = comparePredictions(
    scene([shape('a', 'car', 0, 0, 100, 100), shape('b', 'truck', 200, 0, 100, 100)]),
    [
      detection('car', 600, 0, 100, 100, 0.9),
      detection('truck', 602, 2, 100, 100, 0.85),
      detection('car', 0, 0, 100, 100),
    ],
    ['car', 'truck'],
  );
  assert.equal(missing(r).length, 1);
  assert.equal(missing(r)[0].prediction.label, 'car');
});
test('frames with mask or 3D annotations are skipped for missing detection', () => {
  const data = scene([shape('a', 'car', 0, 0, 100, 100)]);
  data.annotations.push({
    id: 'm',
    frame_id: 'f',
    label: 'car',
    geometry: { type: 'mask', encoding: 'rle', size: [10, 10], counts: [100] },
  });
  const r = comparePredictions(data, [detection('car', 500, 0, 100, 100)], ['car']);
  assert.equal(missing(r).length, 0);
  assert.equal(r.skipped.missing_unknown_geometry_frames, 1);
});
test('missing detection treats polygon extent as covered', () => {
  const data = scene([shape('a', 'car', 0, 0, 10, 10)]);
  data.annotations.push({
    id: 'poly',
    frame_id: 'f',
    label: 'car',
    geometry: {
      type: 'polygon',
      points: [
        [400, 0],
        [600, 0],
        [600, 200],
        [400, 200],
      ],
    },
  });
  const r = comparePredictions(data, [detection('car', 450, 50, 100, 100)], ['car']);
  assert.equal(missing(r).length, 0);
});
