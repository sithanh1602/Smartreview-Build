import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset } from '../server/repository.ts';
import { ENGINE_VERSION } from '../core/risk/engine.ts';
import { buildReport, ProjectHandoffs } from '../server/projects/handoff.ts';
import { handleProjects } from '../server/projects/http.ts';

const box = (x: number) => ({ type: 'bbox' as const, x, y: 10, width: 80, height: 80 });
const scene = {
  schema_version: '1.0.0',
  dataset: { id: 's', name: 's', source: { kind: 'model' } },
  media: [{ id: 'm', name: 'm.jpg', type: 'image', width: 640, height: 480 }],
  frames: [{ id: 'f0', media_id: 'm', index: 0 }],
  annotations: ['car', 'bus', 'person'].map((label, i) => ({
    id: `b${i}`,
    frame_id: 'f0',
    label,
    confidence: 0.9,
    geometry: box(i * 150),
  })),
};
const load = () =>
  buildDataset(
    JSON.stringify(scene),
    { engineVersion: ENGINE_VERSION },
    { remote: false, locate: (image: string) => image, read: async () => null },
  );
const review = (decision: string, more = {}) =>
  ({
    decision,
    error_type: null,
    corrected_value: null,
    note: null,
    version: 1,
    reviewed_at: '',
    ...more,
  }) as any;
const leader = { id: 'L', username: 'lead', role: 'leader' as const };
const anna = { id: 'A', username: 'anna', role: 'member' as const };
// One table, kept in memory; `missing` behaves like a database before migration 007.
function pool(missing = false) {
  const rows = new Map<string, any>();
  return {
    rows,
    async execute(sql: string, values: any[]) {
      if (missing) throw Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' });
      if (sql.startsWith('SELECT')) return [[rows.get(values[0])].filter(Boolean)];
      if (sql.startsWith('DELETE')) return [rows.delete(values[0])];
      if (rows.has(values[0])) throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
      const [project_id, dataset_fingerprint, sent_by, sent_by_name, recipients, note, report] =
        values;
      rows.set(project_id, {
        status: 'SENT',
        returned_at: null,
        returned_by_name: null,
        result: null,
        project_id,
        dataset_fingerprint,
        sent_by,
        sent_by_name,
        recipients,
        note,
        report,
        sent_at: '2026-10-12 08:00:00.000',
      });
      return [{}];
    },
  } as any;
}
const people = {
  creator: null,
  reviewers: [],
  annotators: [
    { id: 'A', username: 'anna' },
    { id: 'B', username: 'ben' },
  ],
};

test('the report holds confirmed errors and marked missing objects only', async () => {
  const dataset = await load();
  const report = buildReport(
    { id: 'p', name: 'P' },
    dataset,
    {
      b0: review('ERROR', { error_type: 'CLASS', corrected_value: 'truck', note: 'xe tải' }),
      b1: review('CORRECT'),
      b2: review('UNSURE'),
    },
    {
      f0: {
        status: 'REVIEWED',
        note: '',
        version: 1,
        updated_at: '',
        missing_regions: [{ id: 'r1', label: 'bicycle', note: 'góc phải', geometry: box(500) }],
      },
    },
  );
  assert.equal(report.dataset_revision, dataset.meta.dataset_id);
  assert.deepEqual(
    report.errors.map((e) => [e.id, e.class_name, e.error_type, e.corrected_value, e.note]),
    [['b0', 'car', 'CLASS', 'truck', 'xe tải']],
  );
  assert.deepEqual(report.errors[0].geometry, box(0));
  assert.deepEqual(
    report.missing.map((m) => [m.id, m.frame_ref, m.class_name, m.note, m.width]),
    [['f0:r1', 'f0', 'bicycle', 'góc phải', 640]],
  );
});

test('sending needs annotators of the project, happens once, and reopening removes it', async () => {
  const handoffs = new ProjectHandoffs(pool());
  const report = {
    project: { id: 'p', name: 'P' },
    dataset_revision: 'rev',
    errors: [],
    missing: [],
  };
  assert.equal(await handoffs.locked('p'), false);
  for (const input of [{}, { annotator_ids: [] }, { annotator_ids: ['A', 'X'] }])
    await assert.rejects(
      () => handoffs.send('p', input, leader, people, report),
      (e: any) => e.status === 400,
    );
  const sent = await handoffs.send(
    'p',
    { annotator_ids: ['A'], note: ' sửa giúp ' },
    leader,
    people,
    report,
  );
  assert.deepEqual(sent.recipients, [{ id: 'A', username: 'anna' }]);
  assert.equal(sent.note, 'sửa giúp');
  assert.equal(sent.sent_by_name, 'lead');
  assert.equal(await handoffs.locked('p'), true);
  await assert.rejects(
    () => handoffs.send('p', { annotator_ids: ['B'] }, leader, people, report),
    (e: any) => e.status === 409,
  );
  // Only the annotators it was sent to read it; a changed dataset is reported as not current.
  assert.equal((await handoffs.report('p', anna, 'annotator', 'rev')).handoff.for_me, true);
  assert.equal((await handoffs.report('p', leader, 'leader', 'other')).handoff.current, false);
  await assert.rejects(
    () => handoffs.report('p', { ...anna, id: 'B' }, 'annotator', 'rev'),
    (e: any) => e.status === 403,
  );
  await handoffs.reopen('p');
  assert.equal(await handoffs.locked('p'), false);
  await assert.rejects(
    () => handoffs.report('p', leader, 'leader', 'rev'),
    (e: any) => e.status === 404,
  );
});

test('a database without the table reads as not sent and refuses to send', async () => {
  const handoffs = new ProjectHandoffs(pool(true));
  assert.equal(await handoffs.get('p', leader), null);
  assert.equal(await handoffs.locked('p'), false);
  await handoffs.reopen('p');
  await assert.rejects(
    () =>
      handoffs.send('p', { annotator_ids: ['A'] }, leader, people, {
        project: { id: 'p', name: 'P' },
        dataset_revision: 'rev',
        errors: [],
        missing: [],
      }),
    (e: any) => e.status === 503,
  );
});

test('routes: annotators cannot send or reopen, a sent review rejects edits until reopened', async () => {
  const id = '00000000-0000-0000-0000-000000000000';
  const handoffs = new ProjectHandoffs(pool());
  const call = (role: string, method: string, route: string, dispatched = { n: 0 }) =>
    handleProjects(
      { method, headers: { host: 'localhost' }, user: leader } as any,
      {} as any,
      new URL(`http://localhost/api/projects/${id}${route}`),
      {
        projects: {
          members: { role: async () => role, people: async () => people },
          handoffs,
          context: async () => ({ dataset: { meta: { dataset_id: 'rev' } }, reviews: {} }),
        },
        json: () => {},
        dispatch: () => void dispatched.n++,
      } as any,
    );
  await assert.rejects(
    () => call('annotator', 'POST', '/handoff'),
    (e: any) => e.status === 403,
  );
  await assert.rejects(
    () => call('annotator', 'DELETE', '/handoff'),
    (e: any) => e.status === 403,
  );
  const passed = { n: 0 };
  await call('reviewer', 'PUT', '/cases/b0/review', passed);
  assert.equal(passed.n, 1);
  await handoffs.send(id, { annotator_ids: ['A'] }, leader, people, {
    project: { id, name: 'P' },
    dataset_revision: 'rev',
    errors: [],
    missing: [],
  });
  for (const [method, route] of [
    ['PUT', '/cases/b0/review'],
    ['POST', '/cases/b0/review'],
    ['PUT', '/frames/f0/review'],
  ])
    for (const role of ['reviewer', 'leader'])
      await assert.rejects(
        () => call(role, method, route, passed),
        (e: any) => e.status === 423,
      );
  await call('reviewer', 'GET', '/cases/b0/review', passed);
  assert.equal(passed.n, 2);
  await call('leader', 'DELETE', '/handoff');
  await call('reviewer', 'PUT', '/cases/b0/review', passed);
  assert.equal(passed.n, 3);
  await handoffs.send(id, { annotator_ids: ['A'] }, leader, people, {
    project: { id, name: 'P' },
    dataset_revision: 'rev',
    errors: [],
    missing: [],
  });
  await assert.rejects(
    () => call('reviewer', 'PUT', '/cases/b0/review', passed),
    (e: any) => e.status === 423,
  );
  await call('reviewer', 'DELETE', '/handoff');
  await call('reviewer', 'PUT', '/cases/b0/review', passed);
  assert.equal(passed.n, 4);
});

test('the CVAT export reads back as the same boxes and the ZIP is a readable archive', async () => {
  const { exportCvatImages } = await import('../core/exporters/cvat-images.ts');
  const { importCvatImages } = await import('../core/importers/cvat-images.ts');
  const { ZipWriter, crc32 } = await import('../server/projects/zip.ts');
  const { readZip } = await import('../src/lib/zip.ts');
  const { PassThrough } = await import('node:stream');
  const data = {
    ...scene,
    media: [{ ...scene.media[0], name: 'a & "b"/m.jpg' }],
    annotations: [
      ...scene.annotations,
      {
        id: 'p',
        frame_id: 'f0',
        label: 'road <edge>',
        geometry: {
          type: 'polygon' as const,
          points: [
            [1, 2],
            [30.5, 4],
            [9, 40.25],
          ],
        },
      },
    ],
  } as any;
  const { xml, skipped } = exportCvatImages(data);
  assert.equal(skipped, 0);
  const back = importCvatImages(xml);
  assert.equal(back.media[0].name, 'a & "b"/m.jpg');
  assert.deepEqual(
    back.annotations.map((a) => [a.label, a.geometry]),
    data.annotations.map((a: any) => [a.label, a.geometry]),
  );
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const out = new PassThrough(),
    chunks: Buffer[] = [];
  out.on('data', (c) => chunks.push(c));
  const zip = new ZipWriter(out);
  await zip.add('annotations.xml', Buffer.from(xml));
  await zip.add('images/ảnh 1.jpg', Buffer.from([1, 2, 3, 4]));
  await zip.end();
  const entries = await readZip(new Blob([Buffer.concat(chunks)]));
  assert.deepEqual(
    entries.map((e) => [e.name, e.size]),
    [
      ['annotations.xml', Buffer.byteLength(xml)],
      ['images/ảnh 1.jpg', 4],
    ],
  );
  assert.equal(await (await entries[0].blob()).text(), xml);
});

test('a returned dataset is compared with what was sent', async () => {
  const { compareReturn, sameShape } = await import('../server/projects/handoff.ts');
  assert.equal(sameShape(box(0), { ...box(0), x: 0.4 }), true);
  assert.equal(sameShape(box(0), { ...box(0), x: 1 }), false);
  const sent = (id: string, class_name: string, x: number) =>
    ({ id, annotation_id: id, frame_ref: 'old', class_name, geometry: box(x) }) as any;
  const result = compareReturn(
    {
      project: { id: 'p', name: 'P' },
      dataset_revision: 'r1',
      errors: [sent('e1', 'car', 0), sent('e2', 'bus', 150), sent('e3', 'person', 300)],
      missing: [
        { ...sent('m1', 'bicycle', 450), annotation_id: null },
        { ...sent('m2', 'dog', 800), annotation_id: null },
      ],
    },
    {
      dataset_revision: 'r2',
      annotations: [
        { id: 'n1', frame_id: 'new', label: 'truck', geometry: box(0) },
        { id: 'n2', frame_id: 'new', label: 'bus', geometry: box(150.2) },
        { id: 'n3', frame_id: 'new', label: 'bicycle', geometry: box(455) },
        // Same place on another image: must not be taken for this one.
        { id: 'x', frame_id: 'other', label: 'person', geometry: box(300) },
      ],
    },
    new Map([['old', 'new']]),
    (frame) => `/img/${frame}`,
  );
  assert.deepEqual(
    [...result.errors, ...result.missing].map((i) => [i.id, i.outcome, i.now?.id ?? null]),
    [
      ['e1', 'changed', 'n1'],
      ['e2', 'unchanged', 'n2'],
      ['e3', 'removed', null],
      ['m1', 'added', 'n3'],
      ['m2', 'not_added', null],
    ],
  );
  assert.equal(result.dataset_revision, 'r2');
  assert.deepEqual([result.errors[0].frame_ref, result.errors[0].image_url], ['new', '/img/new']);
});

test('a returned round unlocks the review, and only then can it be sent again', async () => {
  const p = pool();
  const handoffs = new ProjectHandoffs(p);
  const report = {
    project: { id: 'p', name: 'P' },
    dataset_revision: 'r',
    errors: [],
    missing: [],
  };
  await assert.rejects(
    () => handoffs.sent('p', anna, 'annotator'),
    (e: any) => e.status === 409,
  );
  await handoffs.send('p', { annotator_ids: ['A'] }, leader, people, report);
  await assert.rejects(
    () => handoffs.sent('p', anna, 'reviewer'),
    (e: any) => e.status === 403,
  );
  await assert.rejects(
    () => handoffs.sent('p', { ...anna, id: 'B' }, 'annotator'),
    (e: any) => e.status === 403,
  );
  assert.deepEqual(await handoffs.sent('p', anna, 'annotator'), report);
  // The fake keeps one row; a returned round is that row with its status changed.
  Object.assign(p.rows.get('p'), {
    status: 'RETURNED',
    returned_by_name: 'anna',
    returned_at: '2026-10-13 09:00:00.000',
    result: JSON.stringify({ dataset_revision: 'r2', errors: [], missing: [] }),
  });
  assert.equal(await handoffs.locked('p'), false);
  const seen = await handoffs.report('p', leader, 'leader', 'r2');
  assert.deepEqual(
    [seen.handoff.status, seen.handoff.returned_by_name, seen.result?.dataset_revision],
    ['RETURNED', 'anna', 'r2'],
  );
  const again = await handoffs.send('p', { annotator_ids: ['B'] }, leader, people, report);
  assert.deepEqual([again.status, again.recipients[0].username], ['SENT', 'ben']);
});

test('a file edited in CVAT comes back as the project dataset over the same images', async () => {
  const { exportCvatImages } = await import('../core/exporters/cvat-images.ts');
  const { returnedDataset } = await import('../server/projects/return.ts');
  const { compareReturn } = await import('../server/projects/handoff.ts');
  // As the project stores it: two images, each frame pointing at its stored file.
  const stored = {
    ...scene,
    media: [
      { id: 'm', name: 'street/m.jpg', type: 'image', width: 640, height: 480 },
      { id: 'n', name: 'n.png', type: 'image', width: 320, height: 240 },
    ],
    frames: [
      { id: 'f0', media_id: 'm', index: 0, image: 'media/street/m.jpg' },
      { id: 'f1', media_id: 'n', index: 0, image: 'media/n.png' },
    ],
  } as any;
  const { xml } = exportCvatImages(stored);
  const give = (text: string) =>
    returnedDataset(stored, [{ name: 'annotations.xml', text }], { id: 'p', name: 'P' });
  // The annotator renames the car to truck, deletes the person and draws a box on n.png.
  const edited = xml
    .replace('label="car"', 'label="truck"')
    .replace(/\s*<box label="person"[^>]*><\/box>/, '')
    .replace(
      /(<image id="1"[^>]*>)/,
      '$1\n    <box label="dog" occluded="0" xtl="10.00" ytl="10.00" xbr="60.00" ybr="60.00"></box>',
    );
  const { data, frames } = give(edited);
  assert.deepEqual(
    data.frames.map((f) => f.image),
    ['media/street/m.jpg', 'media/n.png'],
  );
  assert.deepEqual([...frames.keys()], ['f0', 'f1']);
  assert.deepEqual(data.annotations.map((a) => a.label).sort(), ['bus', 'dog', 'truck']);
  const sent = (id: string, class_name: string, frame_ref: string, geometry: any) =>
    ({ id, annotation_id: id, frame_ref, class_name, geometry }) as any;
  const result = compareReturn(
    {
      project: { id: 'p', name: 'P' },
      dataset_revision: 'r1',
      errors: [
        sent('b0', 'car', 'f0', box(0)),
        sent('b1', 'bus', 'f0', box(150)),
        sent('b2', 'person', 'f0', box(300)),
      ],
      missing: [{ ...sent('f1:r', 'dog', 'f1', box(5)), annotation_id: null }],
    },
    { dataset_revision: 'r2', annotations: data.annotations },
    frames,
  );
  assert.deepEqual(
    [...result.errors, ...result.missing].map((i) => i.outcome),
    ['changed', 'unchanged', 'removed', 'added'],
  );
  // Refused: a file without one of the project's images, a resized image, an unknown file.
  for (const bad of [
    xml.replace(/\s*<image id="1"[\s\S]*?<\/image>/, ''),
    xml.replace('width="320"', 'width="321"'),
    '<html></html>',
  ])
    assert.throws(
      () => give(bad),
      (e: any) => e.status === 422,
    );
});

test('every export format reads back as the project dataset over the same images', async () => {
  const { EXPORT_FORMATS, exportDataset } = await import('../core/exporters/formats.ts');
  const { returnedDataset } = await import('../server/projects/return.ts');
  const triangle: [number, number][] = [
    [20, 20],
    [120, 40],
    [60, 140],
  ];
  const stored = {
    ...scene,
    media: [
      { id: 'm', name: 'street/m.jpg', type: 'image', width: 640, height: 480 },
      { id: 'n', name: 'n.png', type: 'image', width: 320, height: 240 },
      { id: 'e', name: 'empty.jpg', type: 'image', width: 100, height: 100 },
    ],
    frames: [
      { id: 'f0', media_id: 'm', index: 0, image: 'media/street/m.jpg' },
      { id: 'f1', media_id: 'n', index: 0, image: 'media/n.png' },
      { id: 'f2', media_id: 'e', index: 0, image: 'media/empty.jpg' },
    ],
    annotations: [
      ...scene.annotations,
      {
        id: 'p',
        frame_id: 'f1',
        label: 'road',
        geometry: { type: 'polygon', points: triangle },
      },
    ],
  } as any;
  const bounds = (g: any) =>
    g.type === 'bbox'
      ? [g.x, g.y, g.width, g.height]
      : (() => {
          const xs = g.points.map((p: number[]) => p[0]),
            ys = g.points.map((p: number[]) => p[1]);
          const x = Math.min(...xs),
            y = Math.min(...ys);
          return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
        })();
  const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 0.05);
  for (const format of Object.keys(EXPORT_FORMATS) as (keyof typeof EXPORT_FORMATS)[]) {
    const out = exportDataset(format, stored);
    assert.equal(out.skipped, 0, format);
    const paths = stored.media.map(out.image);
    assert.equal(new Set(paths).size, 3, format);
    const { data, frames } = returnedDataset(
      stored,
      out.files.map((f) => ({ name: f.path, text: f.text })),
      { id: 'p', name: 'P' },
    );
    assert.deepEqual([...frames.keys()].sort(), ['f0', 'f1', 'f2'], format);
    const byFrame = (id: string) =>
      data.annotations
        .filter((a) => a.frame_id === frames.get(id))
        .map((a) => [a.label, bounds(a.geometry)] as const)
        .sort((a, b) => a[1][0] - b[1][0]);
    const f0 = byFrame('f0');
    assert.deepEqual(
      f0.map((a) => a[0]),
      ['car', 'bus', 'person'],
      format,
    );
    f0.forEach(([, b], i) => assert.ok(near(b, [i * 150, 10, 80, 80]), `${format} ${b}`));
    const [road] = byFrame('f1');
    assert.equal(road[0], 'road', format);
    assert.ok(near(road[1], [20, 20, 100, 120]), `${format} ${road[1]}`);
    assert.deepEqual(byFrame('f2'), [], format);
  }
});

test('unsure and unreviewed risk cases go to the annotators to look at again, also as CVAT issues', async () => {
  const { compareReturn } = await import('../server/projects/handoff.ts');
  const { handoffIssues } = await import('../server/cvat/tasks.ts');
  const dataset = await load();
  const reviews = {
    b0: review('ERROR', { error_type: 'CLASS', corrected_value: 'truck', note: 'xe tải' }),
    b2: review('UNSURE', { note: 'mờ' }),
  };
  // Left out unless the reviewer asks for it.
  assert.deepEqual(buildReport({ id: 'p', name: 'P' }, dataset, reviews, {}).review, []);
  const report = buildReport({ id: 'p', name: 'P' }, dataset, reviews, {}, { review: true });
  const queued = new Set(dataset.cases.map((c) => c.id));
  // Unsure on any label; unreviewed only from the risk queue; never a decided case.
  const expected = dataset.allCases
    .filter((c) => c.id === 'b2' || (queued.has(c.id) && !(c.id in reviews)))
    .map((c) => c.id)
    .sort();
  assert.deepEqual(report.review!.map((c) => c.id).sort(), expected);
  assert.ok(report.review!.every((c) => c.id !== 'b0'));
  const b2 = report.review!.find((c) => c.id === 'b2')!;
  assert.deepEqual([b2.status, b2.note, b2.class_name], ['UNSURE', 'mờ', 'person']);
  assert.ok(report.review!.filter((c) => c.id !== 'b2').every((c) => c.status === 'UNREVIEWED'));
  // Returned unchanged: the label to look at again is still there as it was.
  const result = compareReturn(
    report,
    { dataset_revision: 'r2', annotations: dataset.normalized.annotations },
    new Map([['f0', 'f0']]),
  );
  assert.equal(result.review!.find((c) => c.id === 'b2')!.outcome, 'unchanged');
  // A report sent before review items existed still compares.
  assert.deepEqual(
    compareReturn(
      { ...report, review: undefined },
      { dataset_revision: 'r2', annotations: [] },
      new Map(),
    ).review,
    [],
  );
  const issues = handoffIssues(report);
  assert.equal(issues.length, 1 + report.review!.length);
  assert.match(
    issues[0].message,
    /^\[Lỗi\] Class: car · sửa thành truck · Ghi chú: xe tải · Lý do cảnh báo: /,
  );
  const unsure = issues.find((i) => i.message.startsWith('[Cần xem lại] person'))!;
  assert.match(unsure.message, /Reviewer chưa chắc · rủi ro \d+ · Ghi chú: mờ/);
  assert.deepEqual(unsure.geometry, box(300));
});

test('reviewers accept or reject returned items; a rejection marks the item again', async () => {
  const { ProjectService } = await import('../server/projects/service.ts');
  const dataset = await load();
  const saved: any[] = [];
  const regions = new Map<string, any>();
  const result: any = {
    dataset_revision: 'r2',
    errors: [
      {
        id: 'b0',
        frame_ref: 'f0',
        class_name: 'car',
        geometry: box(0),
        error_type: 'CLASS',
        corrected_value: 'truck',
        note: 'xe tải',
        outcome: 'changed',
        now: { id: 'b0', class_name: 'truck', geometry: box(0) },
      },
      {
        id: 'gone',
        frame_ref: 'f0',
        class_name: 'bus',
        geometry: box(150),
        error_type: 'CLASS',
        corrected_value: 'van',
        note: null,
        outcome: 'removed',
        now: null,
      },
    ],
    missing: [],
  };
  let stored = JSON.stringify(result);
  const frameRow = (id: string) => regions.get(id);
  // Just what judge touches: the handoff row, the loaded project, and frame_reviews.
  const fake: any = {
    handoffs: {
      returnedResult: async () => JSON.parse(stored),
      saveResult: async (_: string, r: any) => void (stored = JSON.stringify(r)),
    },
    context: async () => ({
      dataset,
      reviews: {
        datasetId: 1,
        list: async () => Object.fromEntries(saved.map((s) => [s.id, { version: 1 }])),
        save: async (c: any, input: any, mode: string) => saved.push({ id: c.id, input, mode }),
      },
    }),
    pool: {
      execute: async (sql: string, values: any[]) =>
        sql.startsWith('SELECT') ? [[frameRow('f0')].filter(Boolean)] : [[]],
      getConnection: async () => ({
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        release: () => {},
        execute: async (sql: string, values: any[]) => {
          if (sql.startsWith('INSERT') || sql.startsWith('UPDATE'))
            regions.set('f0', {
              status: values[0],
              missing_regions: values[1],
              note: values[2],
              version: (regions.get('f0')?.version ?? 0) + 1,
              updated_at: '2026-10-16 00:00:00.000',
            });
          if (sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
          return [[frameRow('f0')]];
        },
      }),
    },
  };
  const judge = (input: any, role = 'reviewer') =>
    ProjectService.prototype.judge.call(fake, 'p', input, leader as any, role as any);
  await assert.rejects(
    () => judge({ item_id: 'b0', verdict: 'accept' }, 'annotator'),
    (e: any) => e.status === 403,
  );
  await assert.rejects(
    () => judge({ item_id: 'b0', verdict: 'maybe' }),
    (e: any) => e.status === 400,
  );
  // Rejecting a changed label makes it an Error as it was sent.
  await judge({ item_id: 'b0', verdict: 'reject', note: 'vẫn sai' });
  assert.deepEqual(
    [
      saved[0].mode,
      saved[0].input.decision,
      saved[0].input.error_type,
      saved[0].input.corrected_value,
      saved[0].input.note,
    ],
    ['create', 'ERROR', 'CLASS', 'truck', 'vẫn sai'],
  );
  // Answering again replaces it: accepted, the label is Correct.
  let after = await judge({ item_id: 'b0', verdict: 'accept' });
  assert.deepEqual(
    [saved[1].mode, saved[1].input.decision, saved[1].input.version],
    ['update', 'CORRECT', 1],
  );
  assert.equal(after.errors[0].verdict.value, 'accept');
  // A removed label has nothing to mark: rejecting puts a missing region back on its image.
  after = await judge({ item_id: 'gone', verdict: 'reject' });
  const marked = JSON.parse(regions.get('f0').missing_regions);
  assert.deepEqual(
    marked.map((r: any) => [r.label, r.geometry.x, r.geometry.width]),
    [['van', 150, 80]],
  );
  assert.match(marked[0].id, /^recheck-[0-9a-f]{16}$/);
  // Accepting the removal takes that region away again.
  await judge({ item_id: 'gone', verdict: 'accept' });
  assert.deepEqual(JSON.parse(regions.get('f0').missing_regions), []);
  assert.deepEqual(
    JSON.parse(stored).errors.map((e: any) => e.verdict.value),
    ['accept', 'accept'],
  );
});
