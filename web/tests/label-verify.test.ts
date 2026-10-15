import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  combineWithRisk,
  secondLook,
  verifierReport,
  verifierRequest,
} from '../core/risk/label-verify.ts';
import { VerifyService } from '../server/verify/service.ts';
import { addToQueue } from '../server/verify/queue.ts';
import { handleProjects } from '../server/projects/http.ts';

// The verifier's models live outside this repo; these tests hold what is sent to an engine and
// how policy/_verifier.json scores what it answers.
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
  assert.equal(request.engine, policy.engines.default);
  assert.equal(request.model, policy.engines.siglip.model);
  assert.equal(request.margin, policy.crop.margin);
  assert.equal(request.shape, policy.crop.shape);
  assert.equal(request.pool, policy.engines.siglip.pool);
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

test('the other engine gets the same boxes and captions, without the caption pooling', () => {
  const data = scene([box('a', 'car')]);
  const { request } = verifierRequest(data, (frame) => `/data/${frame.image}`, 'qwen');
  assert.equal(request.engine, 'qwen');
  assert.equal(request.model, policy.engines.qwen.model);
  assert.ok(!('pool' in request));
  assert.deepEqual(request.labels, verifierRequest(data, () => undefined).request.labels);
  // The score table was measured with one engine; a report says when it is read with another.
  const report = (engine?: string) =>
    verifierReport(data, { ...answer([{ id: 'a', scores: { car: 1 } }]), engine });
  assert.deepEqual([report().engine, report().calibrated], ['siglip', true]);
  assert.deepEqual([report('qwen').engine, report('qwen').calibrated], ['qwen', false]);
});

test('a box below its own label’s minimum size is not judged', () => {
  // Above the crop's minimum, below the 32 px the barrier and pole policies ask for.
  const data = scene([box('rail', 'barrier', 30, 12), box('post', 'pole', 28, 30)]);
  const { request, skipped } = verifierRequest(data, (frame) => `/data/${frame.image}`);
  assert.deepEqual(request.boxes, []);
  assert.deepEqual(
    skipped.map((s) => s.reason),
    ['below_minimum_size', 'below_minimum_size'],
  );
});

test('a box is listed as a case from the score the Risk Engine queues at', () => {
  const dataset = JSON.parse(
    readFileSync(new URL('../policy/_dataset.json', import.meta.url), 'utf8'),
  ).dataset_policy;
  const report = verifierReport(scene([box('a', 'car')]), answer([]));
  assert.equal(report.min_score, dataset.tiers.flagged);
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

// Inside a project the verifier runs next to the Risk Engine (policy: with_risk_engine).
test('in a project only boxes the Risk Engine scores are judged', () => {
  const data = scene([box('draft', 'car'), box('grey', 'car'), box('tiny', 'car')]);
  const states: Record<string, string> = { draft: 'draft', grey: 'grey', tiny: 'ignored' };
  const { request, skipped } = verifierRequest(data, () => '/m.jpg', 'siglip', {
    state: (id) => states[id],
  });
  assert.deepEqual(
    request.boxes.map((b) => b.id),
    ['draft'],
  );
  assert.deepEqual(
    skipped.map((s) => [s.annotation_id, s.reason]),
    [
      ['grey', 'not_scored_by_engine'],
      ['tiny', 'not_scored_by_engine'],
    ],
  );
  // A second look names its boxes; the rest are left out without being counted as skipped.
  const again = verifierRequest(data, () => '/m.jpg', 'qwen', { only: new Set(['draft']) });
  assert.deepEqual([again.request.boxes.length, again.skipped.length], [1, 0]);
});

test('the verifier’s score is added to the Risk Engine’s, and a second engine only confirms', () => {
  const [high, queue, warning] = policy.findings[0].score_by_lead;
  const person = (lead: number) => ({ car: (1 - lead) / 2, person: (1 + lead) / 2 });
  const ids = ['both', 'new', 'warned', 'fine'];
  const data = scene(ids.map((id) => box(id, 'car')));
  const first = verifierReport(
    data,
    answer([
      { id: 'both', scores: person(high.lead_at_least + 0.05) },
      { id: 'new', scores: person(queue.lead_at_least + 0.05) },
      { id: 'warned', scores: person(warning.lead_at_least + 0.05) },
      { id: 'fine', scores: person(-0.8) },
    ]),
    [{ annotation_id: 'x', reason: 'not_scored_by_engine' }],
  );
  assert.deepEqual([...secondLook(first)].sort(), ['both', 'new', 'warned']);
  const second = verifierReport(data, {
    ...answer([
      { id: 'both', scores: person(0.9) },
      { id: 'new', scores: person(-0.5) },
      { id: 'warned', scores: person(0.1) },
    ]),
    engine: 'qwen',
  });
  const risk: Record<string, number> = { both: 70, new: 10, warned: 0, fine: 90 };
  const combined = combineWithRisk(first, (id) => risk[id], second);
  const by = Object.fromEntries(combined.findings.map((f) => [f.annotation_id, f]));
  // A box the verifier does not doubt is not a finding, whatever the Risk Engine gave it.
  assert.deepEqual(Object.keys(by).sort(), ['both', 'new', 'warned']);
  assert.deepEqual(
    [by.both.risk_score, by.both.verifier_score, by.both.score, by.both.in_queue],
    [70, high.score, policy.with_risk_engine.max_score, true],
  );
  assert.deepEqual([by.new.score, by.new.in_queue], [10 + queue.score, false]);
  assert.deepEqual([by.warned.score, by.warned.level], [0, 'warning']);
  assert.equal(by.both.second!.confirmed, true);
  assert.equal(by.new.second!.confirmed, false);
  // The second engine's own score never reaches the combined score.
  assert.equal(by.new.score, 10 + queue.score);
  assert.deepEqual(
    [combined.flagged, combined.added_to_queue, combined.confirmed, combined.checked],
    [2, 1, 1, 4],
  );
  assert.deepEqual(combined.skipped, { not_scored_by_engine: 1 });
  assert.deepEqual(
    combined.findings.map((f) => f.annotation_id),
    ['both', 'new', 'warned'],
  );
  // Without a second look nothing is said about confirmation.
  const alone = combineWithRisk(first, (id) => risk[id]);
  assert.equal(alone.confirmed, undefined);
  assert.equal(alone.findings[0].second, undefined);
});

// A case as a loaded dataset holds it.
const riskCase = (id: string, score: number, checks: string[] = []): any => ({
  id,
  annotation_id: id,
  media_name: 'm',
  reference: { annotation_id: id, frame_id: 'f0', frame_index: 0, media_id: 'm' },
  score,
  risk_score: score,
  severity: 'low',
  risk_level: 'low',
  findings: checks.map((check_id) => ({ check_id, score, reason: check_id })),
  reasons: checks,
  check_ids: checks,
});

// The job in a project, with an engine that answers from a table instead of a model.
function project(root: string, calls: any[]) {
  const data = scene([box('wrong', 'car'), box('right', 'car'), box('grey', 'car')]);
  const dataset = {
    normalized: data,
    report: {
      min_score: 30,
      results: [
        { reference: { annotation_id: 'wrong' }, score: 10, state: 'manual' },
        { reference: { annotation_id: 'right' }, score: 0, state: 'manual' },
        { reference: { annotation_id: 'grey' }, score: 0, state: 'grey' },
      ],
    },
    assets: new Map([['f0', '/data/m.jpg']]),
    allCases: data.annotations.map((a: any) => riskCase(a.id, a.id === 'wrong' ? 10 : 0)),
    cases: [] as any[],
    meta: { dataset_id: 'rev' } as any,
  };
  const verifier = {
    available: async () => true,
    run: async (request: any, onProgress?: (done: number, total: number) => void) => {
      calls.push({ engine: request.engine, boxes: request.boxes.map((b: any) => b.id) });
      onProgress?.(request.boxes.length, request.boxes.length);
      return {
        engine: request.engine,
        model: request.model,
        results: request.boxes.map((b: any) => ({
          id: b.id,
          scores: b.id === 'wrong' ? { car: 0.02, person: 0.98 } : { car: 0.98, person: 0.02 },
        })),
        skipped: [],
      };
    },
  };
  const requeued: string[][] = [];
  const reviews = { requeue: async (cases: any[]) => void requeued.push(cases.map((c) => c.id)) };
  const projects = {
    storageRoot: root,
    deleting: new Set(),
    status: 'READY',
    requeued,
    context: async () => ({ dataset, reviews }),
    get: async () => ({ status: projects.status }),
  };
  return { dataset, service: new VerifyService(projects as any, { verifier }), projects, verifier };
}
async function finished(service: VerifyService) {
  let state: any;
  for (let i = 0; i < 100; i++) {
    state = await service.status('project');
    // The job is over once the service lets the next one start.
    if (state.status !== 'RUNNING' && !service.active) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  return state;
}

test('a project run uses the default engine alone unless the second one is asked for', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smartreview-verify-'));
  try {
    const calls: any[] = [];
    const { dataset, service, projects, verifier } = project(root, calls);
    assert.equal((await service.status('project')).status, 'IDLE');
    assert.equal((await service.start('project')).status, 'RUNNING');
    await assert.rejects(
      () => service.start('project'),
      (e: any) => e.status === 409,
    );
    let state = await finished(service);
    assert.equal(state.status, 'READY', state.error);
    assert.deepEqual(calls, [{ engine: 'siglip', boxes: ['wrong', 'right'] }]);
    assert.deepEqual([state.engine, state.second_engine, state.second], ['siglip', 'qwen', false]);
    assert.deepEqual([state.checked, state.flagged, state.added_to_queue], [2, 1, 1]);
    assert.deepEqual(state.skipped, { not_scored_by_engine: 1 });
    const [finding] = state.findings;
    assert.deepEqual(
      [finding.annotation_id, finding.risk_score, finding.score, finding.suggested_label],
      ['wrong', 10, 60, 'person'],
    );
    assert.equal(finding.observation.media_name, 'm');
    assert.equal(finding.second, undefined);
    // What the scan found wrong is now a case of the review queue, and nothing else is.
    assert.deepEqual(
      dataset.cases.map((c: any) => [c.id, c.score, c.check_ids]),
      [['wrong', 60, ['verifier.wrong_label']]],
    );
    assert.deepEqual(projects.requeued, [['wrong']]);
    assert.equal(dataset.meta.total_cases, 1);
    // The result outlives the service, and belongs to one revision of the dataset.
    const reopened = new VerifyService(projects as any, { verifier });
    assert.equal((await reopened.status('project')).status, 'READY');

    calls.length = 0;
    await service.start('project', { second: true });
    state = await finished(service);
    assert.deepEqual(calls, [
      { engine: 'siglip', boxes: ['wrong', 'right'] },
      { engine: 'qwen', boxes: ['wrong'] },
    ]);
    assert.deepEqual([state.second, state.confirmed], [true, 1]);
    assert.equal(state.findings[0].second.confirmed, true);

    dataset.meta.dataset_id = 'changed';
    assert.equal((await service.status('project')).status, 'IDLE');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a failed or missing engine is reported, not thrown at the reader', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smartreview-verify-'));
  try {
    const { service, verifier } = project(root, []);
    verifier.run = async () => {
      throw new Error('label-verifier exited with 1: CUDA out of memory');
    };
    await service.start('project');
    const state = await finished(service);
    assert.equal(state.status, 'FAILED');
    assert.match(state.error, /GPU/);
    assert.doesNotMatch(state.error, /CUDA|exited/);
    assert.equal(service.active, false);
    // A run that failed found nothing, so the same choice may be sent again.
    verifier.run = async () => ({ model: 'm', results: [], skipped: [] }) as any;
    assert.equal((await service.request('project')).status, 'RUNNING');
    assert.equal((await finished(service)).status, 'READY');
    verifier.available = async () => false;
    await assert.rejects(
      () => service.start('project'),
      (e: any) => e.status === 503,
    );
    assert.equal((await service.status('project')).available, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('the route starts a run for the leader only, and the second engine only on request', async () => {
  const url = new URL('http://localhost/api/projects/abc/label-verify');
  const started: any[] = [];
  const projects = (role: string) => ({
    members: { role: async () => role },
    verify: {
      status: async () => ({ status: 'IDLE' }),
      request: async (_id: string, options: any) => (started.push(options), { status: 'RUNNING' }),
    },
  });
  const call = (method: string, role: string, body?: unknown, origin = 'http://localhost') => {
    const req: any = (async function* () {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body));
    })();
    Object.assign(req, {
      method,
      headers: { host: 'localhost', origin, 'content-type': 'application/json' },
      user: { id: 'u', username: 'u', role: 'leader' },
    });
    const sent: any[] = [];
    return handleProjects(req, {} as any, url, {
      projects: projects(role),
      json: (_res: any, status: number, data: any) => sent.push(status, data),
    } as any).then(() => sent);
  };
  assert.deepEqual(await call('GET', 'reviewer'), [200, { status: 'IDLE' }]);
  assert.equal((await call('POST', 'leader', {}))[0], 202);
  await call('POST', 'leader', { second: true });
  await call('POST', 'leader', { second: 'yes' });
  assert.deepEqual(started, [{ second: false }, { second: true }, { second: false }]);
  await assert.rejects(
    () => call('POST', 'reviewer', {}),
    (e: any) => e.status === 403,
  );
  await assert.rejects(
    () => call('POST', 'leader', {}, 'http://evil.example'),
    (e: any) => e.status === 403,
  );
  await assert.rejects(
    () => call('DELETE', 'leader'),
    (e: any) => e.status === 405,
  );
  assert.equal(started.length, 3);
});

test('a scan chosen while the import is still finishing starts when the project is ready', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smartreview-verify-'));
  try {
    const calls: any[] = [];
    const { service, projects } = project(root, calls);
    projects.status = 'ANALYZING';
    const queued: any = await service.request('project', { second: true });
    assert.deepEqual([queued.status, queued.queued], ['IDLE', true]);
    await new Promise((r) => setTimeout(r, 30));
    // Nothing is cropped or run before the import is done.
    assert.deepEqual([calls.length, service.active], [0, false]);
    projects.status = 'READY';
    // What ProjectService.finish() calls once the project is READY.
    await service.drain();
    const state = await finished(service);
    assert.equal(state.status, 'READY', state.error);
    assert.deepEqual(
      calls.map((c) => c.engine),
      ['siglip', 'qwen'],
    );
    assert.equal(state.queued, false);
    // The scan belongs to the upload: once it is done it cannot be asked for again.
    await assert.rejects(
      () => service.request('project'),
      (e: any) => e.status === 409 && /một lần/.test(e.message),
    );
    assert.equal(calls.length, 2);
    // A project with no data cannot queue a scan.
    projects.status = 'CREATED';
    await assert.rejects(
      () => service.request('project'),
      (e: any) => e.status === 409,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('scan findings join the review queue once; warnings and clean boxes do not', () => {
  const found = (id: string, verifier_score: number, risk_score: number): any => ({
    annotation_id: id,
    check_id: 'verifier.wrong_label',
    rule_id: 'verifier.wrong_label',
    error_type: 'CLASS',
    suggested_label: 'person',
    reason: `reason ${id}`,
    verifier_score,
    risk_score,
    score: Math.min(100, risk_score + verifier_score),
  });
  // `queued` is already a risk case; the queue and the full list hold separate copies of it.
  const all = [riskCase('queued', 40, ['geometry.x']), riskCase('new', 0), riskCase('weak', 0)];
  all.push(riskCase('warned', 20, ['geometry.y']), riskCase('clean', 0));
  const dataset: any = {
    report: { min_score: 30 },
    allCases: all,
    cases: [riskCase('queued', 40, ['geometry.x'])],
    meta: {},
  };
  const scan = [found('queued', 50, 40), found('new', 30, 0), found('warned', 0, 20)];
  const changed = addToQueue(dataset, scan);
  assert.deepEqual(changed.map((c) => c.id).sort(), ['new', 'queued']);
  assert.deepEqual(
    dataset.cases.map((c: any) => [c.id, c.score, c.severity]),
    [
      ['queued', 90, 'high'],
      ['new', 30, 'low'],
    ],
  );
  const queued = dataset.cases[0];
  assert.deepEqual(queued.check_ids, ['geometry.x', 'verifier.wrong_label']);
  assert.deepEqual(
    queued.findings.map((f: any) => f.score),
    [40, 50],
  );
  assert.equal(dataset.cases[1].suggested_label, 'person');
  // The copy in the full list says the same as the one in the queue.
  assert.equal(all[0].score, 90);
  // A warning has no points: the box keeps the Risk Engine's score and stays out of the queue.
  assert.deepEqual([all[3].score, all[3].check_ids], [20, ['geometry.y']]);
  assert.deepEqual(dataset.meta, { total_cases: 2, levels: { high: 1, medium: 0, low: 1 } });
  // The same scan applied again, as on every reload of the project, changes nothing.
  assert.deepEqual(addToQueue(dataset, scan), []);
  assert.equal(dataset.cases[0].findings.length, 2);
});
