import type { AddressInfo } from 'node:net';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Project3DService } from '../server/projects3d/service.ts';
import { ENGINE_3D_VERSION, POLICY_3D_VERSION } from '../core/risk3d/engine.ts';
import sharp from 'sharp';
import {
  cameraImage,
  orderCameras,
  summarizeScene,
  waymoComponent,
  waymoSegment,
} from '../shared/waymo.ts';
import { createApp } from './app-helper.ts';

// No MySQL and no Python here: the pool answers the service's own statements from memory, and
// the exporter is a Node script that writes a two-frame scene the way export_waymo.py does.
const SEGMENT = '10203656353524179475_7625_000_7645_000';
const EXPORTER = `
import fs from 'node:fs';
import path from 'node:path';
const [source, , out] = process.argv.slice(2);
for (const c of ['lidar', 'lidar_calibration', 'vehicle_pose', 'lidar_box'])
  if (!fs.existsSync(path.join(source, c))) { console.error('Không tìm thấy file parquet trong ' + c); process.exit(1); }
fs.mkdirSync(path.join(out, 'frames'), { recursive: true });
const frames = [100, 200].map((timestamp, i) => {
  fs.writeFileSync(path.join(out, 'frames', timestamp + '.bin'), Buffer.alloc(22 * 3));
  process.stdout.write('\\r' + (i + 1) + ' frame');
  const box = (id, type, x, counted) => ({ id, type, center: [x, 0, 1], size: type === 'VEHICLE' ? [4.5, 2, 1.6] : [0.8, 0.8, 1.7], heading: 0, counted });
  return { timestamp, file: 'frames/' + timestamp + '.bin', pose: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1], laserCounts: [2, 1],
    // The vehicle 10 m ahead has no point in it in the second frame: one case for the 3D Risk Engine.
    boxes: [box('a', 'VEHICLE', 10, i ? 0 : 120), ...(i ? [box('b', 'PEDESTRIAN', 25, 40)] : [])] };
});
if (fs.existsSync(path.join(source, 'camera_image')))
  for (const [camera, timestamp] of [['FRONT', 100], ['SIDE_LEFT', 100], ['FRONT', 200], ['FRONT', 999]]) {
    fs.mkdirSync(path.join(out, 'cameras', camera), { recursive: true });
    fs.copyFileSync(path.join(path.dirname(process.argv[1]), 'shot.jpg'), path.join(out, 'cameras', camera, timestamp + '.jpg'));
  }
fs.writeFileSync(path.join(out, 'scene.json'), JSON.stringify({
  segment: '${SEGMENT}', lasers: [{ id: 1, name: 'TOP' }, { id: 2, name: 'FRONT' }], frames }));
`;
function memoryPool() {
  const projects = new Map<string, any>();
  let revisions = 0;
  // risk_cases_3d by annotation_key, and review_decisions_3d by case id.
  const cases = new Map<string, { id: number; reference: string }>(),
    decisions = new Map<number, any>();
  const reviewRows = (ids: number[]) =>
    [...cases.values()]
      .filter((c) => ids.includes(c.id) && decisions.has(c.id))
      .map((c) => ({ annotation_reference: c.reference, ...decisions.get(c.id) }));
  const run = async (sql: string, p: any[] = []) => {
    if (sql.startsWith('INSERT IGNORE INTO risk_cases_3d')) {
      for (const [, key, reference] of p[0])
        if (!cases.has(key)) cases.set(key, { id: cases.size + 1, reference });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT id FROM risk_cases_3d'))
      return [p[1].map((key: string) => ({ id: cases.get(key)!.id }))];
    if (sql.startsWith('SELECT version FROM review_decisions_3d'))
      return [
        p[0].filter((id: number) => decisions.has(id)).map((id: number) => decisions.get(id)),
      ];
    if (sql.startsWith('INSERT INTO review_decisions_3d')) {
      for (const [id, decision, error_type, corrected_value, note, , reviewed_at] of p[0])
        decisions.set(id, {
          decision,
          error_type,
          corrected_value,
          note,
          version: (decisions.get(id)?.version ?? 0) + 1,
          reviewed_at,
        });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT c.annotation_reference'))
      return [reviewRows(sql.includes('IN (?)') ? p[0] : [...decisions.keys()])];
    if (sql.startsWith('SELECT COUNT(*) AS reviewed')) {
      const all = [...decisions.values()];
      const of = (d: string) => all.filter((r) => r.decision === d).length;
      return [
        [
          {
            reviewed: all.length,
            correct: of('CORRECT'),
            errors: of('ERROR'),
            unsure: of('UNSURE'),
          },
        ],
      ];
    }
    if (sql.startsWith('INSERT INTO projects_3d'))
      projects.set(p[0], {
        id: p[0],
        name: p[1],
        description: p[2],
        format: p[3],
        created_by: p[4],
        status: 'CREATED',
        error_message: null,
        metadata: null,
        dataset_revision_id: null,
        storage_key: null,
      });
    else if (sql.startsWith("UPDATE projects_3d SET status='UPLOADING'")) {
      const row = projects.get(p[0]);
      if (!['CREATED', 'FAILED'].includes(row.status)) return [{ affectedRows: 0 }];
      row.status = 'UPLOADING';
    } else if (sql.startsWith("UPDATE projects_3d SET status='READY'"))
      Object.assign(projects.get(p[6]), {
        status: 'READY',
        dataset_revision_id: p[1],
        metadata: JSON.parse(p[2]),
        storage_provider: p[3],
        storage_key: p[4],
      });
    else if (sql.startsWith('UPDATE projects_3d SET metadata=?'))
      projects.get(p[1]).metadata = JSON.parse(p[0]);
    else if (sql.startsWith('UPDATE projects_3d SET status=?'))
      Object.assign(projects.get(p[2]), { status: p[0], error_message: p[1] });
    else if (sql.startsWith('INSERT INTO dataset_revisions_3d')) return [{ insertId: ++revisions }];
    else if (sql.startsWith('DELETE FROM projects_3d')) projects.delete(p[0]);
    else if (sql.startsWith('SELECT p.created_by'))
      return [projects.has(p[1]) ? [{ ...projects.get(p[1]), role: null }] : []];
    else if (sql.startsWith('SELECT')) {
      const id = p.at(-1);
      return [projects.has(id) ? [{ ...projects.get(id) }] : [...projects.values()]];
    }
    return [{ affectedRows: 1 }];
  };
  const connection = {
    execute: run,
    query: run,
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
  return { execute: run, query: run, getConnection: async () => connection, projects };
}
const stored: string[] = [];
const remoteFiles = new Map<string, Buffer>();
const remote = {
  name: 'dropbox' as const,
  async write(key: string, data: Uint8Array) {
    remoteFiles.set(key, Buffer.from(data));
  },
  async uploadFiles(files: { key: string; file: string }[]) {
    for (const f of files) {
      remoteFiles.set(f.key, await fs.readFile(f.file));
      stored.push(f.key);
    }
  },
  async read(key: string) {
    return remoteFiles.get(key) ?? null;
  },
  async remove(key: string) {
    for (let i = stored.length; i--; ) if (stored[i].startsWith(key + '/')) stored.splice(i, 1);
  },
};
const parquet = () => new Blob(['PAR1', 'x'.repeat(40), 'PAR1']);
let shot: Buffer;
let tmp: string, pool: ReturnType<typeof memoryPool>, server: any, base: string;
before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-3d-'));
  await fs.writeFile(path.join(tmp, 'exporter.mjs'), EXPORTER);
  shot = await sharp({ create: { width: 64, height: 40, channels: 3, background: '#3366cc' } })
    .jpeg()
    .toBuffer();
  await fs.writeFile(path.join(tmp, 'shot.jpg'), shot);
  pool = memoryPool();
  const projects3d = new Project3DService(pool as any, path.join(tmp, 'storage'), remote, {
    python: process.execPath,
    script: path.join(tmp, 'exporter.mjs'),
  });
  server = createApp({ projects3d, distRoot: tmp });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await fs.rm(tmp, { recursive: true, force: true });
});
async function create(name: string) {
  const res = await fetch(`${base}/api/projects3d`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  assert.equal(res.status, 201);
  return (await res.json()) as any;
}
async function upload(id: string, parts: Record<string, Blob>, shots: string[] = []) {
  const form = new FormData();
  for (const name of shots) form.append('camera', new Blob([new Uint8Array(shot)]), name);
  for (const [component, blob] of Object.entries(parts))
    form.append(component, blob, `validation_${component}_${SEGMENT}.parquet`);
  const res = await fetch(`${base}/api/projects3d/${id}/import`, { method: 'POST', body: form });
  return { status: res.status, body: (await res.json()) as any };
}
const required = () => ({
  lidar: parquet(),
  lidar_calibration: parquet(),
  vehicle_pose: parquet(),
  lidar_box: parquet(),
});

test('a parquet file is sorted into its Waymo component', () => {
  assert.equal(waymoComponent(`validation_lidar_${SEGMENT}.parquet`), 'lidar');
  assert.equal(waymoComponent(`training_lidar_box_${SEGMENT}.parquet`), 'lidar_box');
  assert.equal(waymoComponent(`validation_lidar_pose_${SEGMENT}.parquet`), 'lidar_pose');
  assert.equal(waymoComponent('waymo-test/vehicle_pose/part-0.parquet'), 'vehicle_pose');
  // Other Waymo components and other files are not part of a 3D project.
  assert.equal(waymoComponent(`validation_lidar_segmentation_${SEGMENT}.parquet`), null);
  assert.equal(waymoComponent(`validation_camera_image_${SEGMENT}.parquet`), 'camera_image');
  assert.equal(waymoComponent(`validation_camera_box_${SEGMENT}.parquet`), null);
  assert.equal(waymoComponent('lidar/readme.txt'), null);
  assert.equal(waymoSegment(`a/b/validation_lidar_box_${SEGMENT}.parquet`), SEGMENT);
  assert.equal(waymoSegment('lidar/part-0.parquet'), null);
});

test('a scene is summarised for the project card', () => {
  const frame = (timestamp: number, boxes: unknown[]) => ({
    timestamp,
    file: `frames/${timestamp}.bin`,
    laserCounts: [10, 5],
    boxes,
  });
  const summary = summarizeScene({
    segment: 's',
    lasers: [{ name: 'TOP' }],
    frames: [
      frame(1_000_000, [{ id: 'a', type: 'VEHICLE' }]),
      frame(1_100_000, [
        { id: 'a', type: 'VEHICLE' },
        { id: 'b', type: 'SIGN' },
      ]),
    ],
  });
  assert.deepEqual(summary, {
    segment: 's',
    total_frames: 2,
    total_boxes: 3,
    total_points: 30,
    boxes_by_type: { VEHICLE: 2, SIGN: 1 },
    tracked_objects: 2,
    lasers: ['TOP'],
    duration_seconds: 0.1,
    cameras: [],
    total_images: 0,
  });
  assert.throws(() => summarizeScene({ segment: 's', lasers: [], frames: [] }));
  assert.throws(() =>
    summarizeScene({ segment: 's', lasers: [], frames: [{ ...frame(1, []), file: '../x' }] }),
  );
});

test('importing a segment stores the scene under Project3D on the remote', async () => {
  const project = await create('Segment A');
  assert.equal(project.status, 'CREATED');
  assert.equal(project.format, 'waymo-v2');
  const { status, body } = await upload(project.id, required());
  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.status, 'READY');
  assert.equal(body.metadata.total_frames, 2);
  assert.equal(body.metadata.total_boxes, 3);
  assert.equal(body.metadata.tracked_objects, 2);
  assert.equal(body.metadata.motion_compensated, false);
  // The segment is scored once, at import, from the scene alone.
  assert.deepEqual(body.metadata.risk, {
    engine_version: ENGINE_3D_VERSION,
    policy_version: POLICY_3D_VERSION,
    total_cases: 1,
    levels: { high: 0, medium: 1, low: 0 },
    gaps: 0,
    warnings: body.metadata.risk.warnings,
  });
  assert.equal(typeof body.metadata.risk.warnings, 'number');
  assert.equal(body.storage_key, undefined);
  const key = pool.projects.get(project.id).storage_key;
  assert.match(key, new RegExp(`^Project3D/${project.id}/[a-f0-9-]{36}$`));
  assert.deepEqual(stored.filter((k) => k.startsWith(key)).sort(), [
    `${key}/frames/100.bin`,
    `${key}/frames/200.bin`,
    `${key}/risk.json`,
    `${key}/scene.json`,
  ]);
  // Nothing is left on this machine: neither the parquet files nor the exported scene.
  assert.deepEqual(await fs.readdir(path.join(tmp, 'storage', 'Project3D')), []);
  assert.deepEqual(await fs.readdir(path.join(tmp, 'storage', '.tmp')), []);
  // The viewer reads the scene and each frame's points through the project's routes.
  for (const k of stored) remoteFiles.set(k, Buffer.from('points'));
  remoteFiles.set(
    `${key}/scene.json`,
    Buffer.from(
      JSON.stringify({
        segment: 's',
        frames: [100, 200].map((timestamp, i) => ({
          timestamp,
          pose: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          boxes: (i ? ['a', 'b'] : ['a']).map((id) => ({
            id,
            type: 'VEHICLE',
            center: [10 + i, id === 'a' ? 0 : 5, 1],
            size: [4.5, 2, 1.6],
            heading: 0,
            counted: 100,
          })),
        })),
      }),
    ),
  );
  // The report of the 3D Risk Engine is read back as it was stored.
  const report = {
    engine_version: 'e',
    policy_version: 'p',
    cases: [{ id: '200:a', findings: [{ check_id: 'track.position_jump', score: 50 }] }],
  };
  remoteFiles.set(`${key}/risk.json`, Buffer.from(JSON.stringify(report)));
  const risk = await fetch(`${base}/api/projects3d/${project.id}/risk`);
  assert.deepEqual([risk.status, await risk.json()], [200, report]);
  const scene = await fetch(`${base}/api/projects3d/${project.id}/scene?dataset=x`);
  assert.equal(scene.status, 200);
  assert.match(scene.headers.get('cache-control')!, /immutable/);
  assert.equal(((await scene.json()) as any).frames.length, 2);
  const frame = await fetch(`${base}/api/projects3d/${project.id}/frames/100.bin`);
  assert.equal(frame.headers.get('content-type'), 'application/octet-stream');
  assert.equal(await frame.text(), 'points');
  assert.equal((await fetch(`${base}/api/projects3d/${project.id}/frames/999.bin`)).status, 404);
  assert.equal(
    (await fetch(`${base}/api/projects3d/${project.id}/frames/..%2Fscene.json`)).status,
    404,
  );
  // Reviews: one cuboid in one frame, then the object in every frame it is boxed in.
  const revision = body.metadata.dataset_id;
  const review = (method: string, path: string, fields: object) =>
    fetch(`${base}/api/projects3d/${project.id}/${path}/review`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset_revision: revision, ...fields }),
    }).then(async (res) => ({ status: res.status, body: (await res.json()) as any }));
  const created = await review('POST', 'boxes/200/b', {
    decision: 'ERROR',
    error_type: 'CLASS',
    corrected_value: 'CYCLIST',
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.reviews['200:b'].version, 1);
  assert.equal((await review('POST', 'boxes/200/b', { decision: 'CORRECT' })).status, 409);
  const updated = await review('PUT', 'boxes/200/b', { decision: 'CORRECT', version: 1 });
  assert.equal(updated.body.reviews['200:b'].version, 2);
  assert.equal(
    (await review('PUT', 'boxes/200/b', { decision: 'UNSURE', version: 1 })).status,
    409,
  );
  // Object b is not boxed in frame 100, and there is no frame 300.
  assert.equal((await review('POST', 'boxes/100/b', { decision: 'CORRECT' })).status, 404);
  assert.equal((await review('POST', 'boxes/300/a', { decision: 'CORRECT' })).status, 404);
  assert.equal(
    (await review('POST', 'boxes/100/a', { decision: 'ERROR', error_type: 'MISSING_OBJECT' }))
      .status,
    400,
  );
  const stale = await fetch(`${base}/api/projects3d/${project.id}/boxes/100/a/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataset_revision: 'other', decision: 'CORRECT' }),
  });
  assert.equal(stale.status, 409);
  const track = await review('PUT', 'tracks/a', {
    decision: 'ERROR',
    error_type: 'BBOX',
    note: 'lệch',
  });
  assert.equal(track.status, 200, JSON.stringify(track.body));
  assert.deepEqual(Object.keys(track.body.reviews).sort(), ['100:a', '200:a']);
  const all = (await (await fetch(`${base}/api/projects3d/${project.id}/reviews`)).json()) as any;
  assert.equal(all.dataset_revision, revision);
  assert.deepEqual(Object.keys(all.reviews).sort(), ['100:a', '200:a', '200:b']);
  assert.equal(all.reviews['100:a'].error_type, 'BBOX');
  const shown = (await (await fetch(`${base}/api/projects3d/${project.id}`)).json()) as any;
  assert.deepEqual(shown.review_summary, { reviewed: 3, correct: 1, errors: 2, unsure: 0 });
  // How the engine's cases fared with those reviews: its one case (200:a) was a real error, and
  // the reviewer found one more (100:a) that it missed.
  const precisionRes = await fetch(`${base}/api/projects3d/${project.id}/risk/precision`);
  const precision = (await precisionRes.json()) as any;
  assert.equal(precisionRes.status, 200, JSON.stringify(precision));
  assert.deepEqual(precision.checks['track.position_jump'], {
    cases: 1,
    reviewed: 1,
    errors: 1,
    correct: 0,
    unsure: 0,
    precision: 1,
  });
  assert.deepEqual(precision.missed, { count: 1, by_error_type: { BBOX: 1 } });
  // A leader scores the stored scene again with the engine as it is now.
  const rescored = await fetch(`${base}/api/projects3d/${project.id}/risk/rescore`, {
    method: 'POST',
  });
  assert.equal(rescored.status, 200, await rescored.clone().text());
  assert.equal(((await rescored.json()) as any).engine_version, ENGINE_3D_VERSION);
  const stored3d = JSON.parse(remoteFiles.get(`${key}/risk.json`)!.toString());
  assert.equal(stored3d.engine_version, ENGINE_3D_VERSION);
  assert.equal(pool.projects.get(project.id).metadata.risk.engine_version, ENGINE_3D_VERSION);
  const again = await upload(project.id, required());
  assert.equal(again.status, 409);
  const listed = (await (await fetch(`${base}/api/projects3d`)).json()) as any[];
  assert.ok(listed.some((p) => p.id === project.id && p.my_role === 'leader'));
  const removed = await fetch(`${base}/api/projects3d/${project.id}`, { method: 'DELETE' });
  assert.equal(removed.status, 200);
  assert.deepEqual(
    stored.filter((k) => k.startsWith(`Project3D/${project.id}/`)),
    [],
  );
});

test('a segment missing a component or holding a non-parquet file is refused', async () => {
  const project = await create('Segment B');
  const { lidar_box, ...partial } = required();
  const missing = await upload(project.id, partial);
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /lidar_box/);
  assert.equal(pool.projects.get(project.id).status, 'FAILED');
  const fake = await upload(project.id, { ...required(), lidar: new Blob(['not a parquet file']) });
  assert.equal(fake.status, 422);
  const unknown = await upload(project.id, { ...required(), camera_box: parquet() });
  assert.equal(unknown.status, 400);
  // The failed project can still be imported.
  const retry = await upload(project.id, { ...required(), lidar_pose: parquet() });
  assert.equal(retry.status, 201, JSON.stringify(retry.body));
  assert.equal(retry.body.metadata.motion_compensated, true);
});

test('camera images are kept as JPEG files and get one sheet for each frame', async () => {
  assert.deepEqual(orderCameras(['FRONT', 'SIDE_RIGHT', 'REAR', 'SIDE_LEFT']), [
    'SIDE_LEFT',
    'FRONT',
    'SIDE_RIGHT',
    'REAR',
  ]);
  assert.deepEqual(cameraImage('cams/front/000012.jpg'), { camera: 'FRONT', frame: '000012' });
  assert.equal(cameraImage('front.jpg'), null);
  // From the camera_image component: the exporter writes the files, one of them for a frame
  // that is not in the scene.
  const project = await create('With cameras');
  const { status, body } = await upload(project.id, { ...required(), camera_image: parquet() });
  assert.equal(status, 201, JSON.stringify(body));
  assert.deepEqual(body.metadata.cameras, ['SIDE_LEFT', 'FRONT']);
  assert.equal(body.metadata.total_images, 3);
  const key = pool.projects.get(project.id).storage_key;
  const files = stored.filter((k) => k.startsWith(key)).map((k) => k.slice(key.length + 1));
  assert.deepEqual(files.filter((f) => !f.startsWith('frames/')).sort(), [
    'cameras/FRONT/100.jpg',
    'cameras/FRONT/200.jpg',
    'cameras/SIDE_LEFT/100.jpg',
    'risk.json',
    'scene.json',
    'sheets/100.jpg',
    'sheets/200.jpg',
  ]);
  // The stored image is the file as it came; the sheet has a tile for each camera.
  assert.ok(remoteFiles.get(`${key}/cameras/FRONT/100.jpg`)!.equals(shot));
  const sheet = await fetch(`${base}/api/projects3d/${project.id}/sheets/100.jpg?dataset=x`);
  assert.equal(sheet.headers.get('content-type'), 'image/jpeg');
  const size = await sharp(Buffer.from(await sheet.arrayBuffer())).metadata();
  assert.deepEqual([size.width, size.height], [480, 160]);
  const image = await fetch(`${base}/api/projects3d/${project.id}/cameras/FRONT/200.jpg`);
  assert.ok(Buffer.from(await image.arrayBuffer()).equals(shot));
  assert.equal(
    (await fetch(`${base}/api/projects3d/${project.id}/cameras/REAR/100.jpg`)).status,
    404,
  );
  const scene = (await (await fetch(`${base}/api/projects3d/${project.id}/scene`)).json()) as any;
  assert.deepEqual(scene.cameras, ['SIDE_LEFT', 'FRONT']);
  assert.deepEqual(
    scene.frames.map((f: any) => f.cameras),
    [['SIDE_LEFT', 'FRONT'], ['FRONT']],
  );

  // Loose files: named by timestamp or by the frame's position; a name matching neither is
  // left out and counted.
  const loose = await create('Loose images');
  const sent = await upload(loose.id, required(), ['rear/200.jpg', 'rear/0.jpg', 'rear/7.jpg']);
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.deepEqual(sent.body.metadata.cameras, ['REAR']);
  assert.equal(sent.body.metadata.total_images, 2);
  assert.equal(sent.body.metadata.unmatched_images, 1);
  // Both sources at once, a name without a camera, and a file that is not a JPEG are refused.
  const both = await create('Both sources');
  const clash = await upload(both.id, { ...required(), camera_image: parquet() }, ['rear/0.jpg']);
  assert.equal(clash.status, 400);
  assert.equal((await upload(both.id, required(), ['0.jpg'])).status, 400);
  const form = new FormData();
  for (const [component, blob] of Object.entries(required()))
    form.append(component, blob, `validation_${component}_${SEGMENT}.parquet`);
  form.append('camera', new Blob(['not an image']), 'rear/0.jpg');
  const fake = await fetch(`${base}/api/projects3d/${both.id}/import`, {
    method: 'POST',
    body: form,
  });
  assert.equal(fake.status, 422);
});
