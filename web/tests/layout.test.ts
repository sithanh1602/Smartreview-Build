import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import sharp from 'sharp';
import {
  LAYOUT,
  analyzeLayout,
  cropOf,
  isRider,
  overlapOf,
  relationOf,
} from '../core/analysis/layout.ts';

// Where boxes sit, how much they overlap and how they are grouped for review.
const box = (id: string, label: string, x: number, y: number, width: number, height: number) => ({
  id,
  frame_id: 'f0',
  label,
  geometry: { type: 'bbox', x, y, width, height },
});
const scene = (annotations: any[]): any => ({
  schema_version: '1.0.0',
  dataset: { id: 'scene', name: 'scene' },
  media: [{ id: 'm', name: 'm.jpg', type: 'image', width: 1280, height: 720 }],
  frames: [{ id: 'f0', media_id: 'm', index: 0, image: 'images/m.jpg' }],
  annotations,
});
const unitOf = (report: any, id: string) =>
  report.units.find((u: any) => u.members.some((m: any) => m.annotation_id === id));

test('overlap is measured against both boxes and named by how much of the smaller one is covered', () => {
  const big = { x: 0, y: 0, width: 100, height: 100 },
    small = { x: 80, y: 80, width: 40, height: 40 };
  const o = overlapOf(big, small);
  assert.equal(o.area, 400);
  assert.equal(o.share_a, 0.04);
  assert.equal(o.share_b, 0.25);
  assert.equal(o.share_small, 0.25);
  assert.ok(Math.abs(o.iou - 400 / 11200) < 1e-9);
  assert.equal(relationOf(o), 'partial');
  assert.equal(relationOf(overlapOf(big, { x: 5, y: 0, width: 100, height: 100 })), 'duplicate');
  assert.equal(relationOf(overlapOf(big, { x: 10, y: 10, width: 30, height: 30 })), 'nested');
  assert.equal(relationOf(overlapOf(big, { x: 70, y: 0, width: 50, height: 100 })), 'heavy');
  assert.equal(relationOf(overlapOf(big, { x: 95, y: 0, width: 100, height: 100 })), undefined);
  assert.equal(overlapOf(big, { x: 200, y: 0, width: 10, height: 10 }).area, 0);
});

test('a box is placed in the image and sized', () => {
  const report = analyzeLayout(
    scene([box('a', 'Car', 0, 600, 256, 120), box('t', 'person', 640, 300, 10, 20)]),
  );
  const [a, t] = report.boxes;
  assert.equal(a.label, 'car');
  assert.deepEqual(a.center, [0.1, 0.917]);
  assert.equal(a.zone, 'bottom-left');
  assert.deepEqual(a.edges, ['left', 'bottom']);
  assert.equal(a.size, 'large');
  assert.equal(a.aspect, 0.469);
  assert.equal(a.area_share, 0.03333);
  assert.equal(t.size, 'tiny');
  assert.equal(t.zone, 'center');
  assert.deepEqual(unitOf(report, 'a').flags, ['at_image_edge']);
  assert.deepEqual(unitOf(report, 't').flags, ['too_small']);
  assert.equal(report.summary.labels.car.width_p50, 256);
  assert.deepEqual(report.summary.units, { single: 2, cluster: 0, rider: 0, mixed: 0 });
});

test('the crop keeps a margin, a minimum size, whole pixels and stays inside the image', () => {
  const image = { width: 1280, height: 720 };
  assert.deepEqual(cropOf({ x: 100, y: 100, width: 200, height: 100 }, image), {
    x: 70,
    y: 85,
    width: 260,
    height: 130,
  });
  // A small box gets the minimum crop around it; at a corner the crop is pushed back inside.
  assert.deepEqual(cropOf({ x: 500, y: 300, width: 20, height: 20 }, image), {
    x: 462,
    y: 262,
    width: 96,
    height: 96,
  });
  assert.deepEqual(cropOf({ x: 1270, y: 0, width: 10, height: 10 }, image), {
    x: 1184,
    y: 0,
    width: 96,
    height: 96,
  });
  assert.deepEqual(cropOf({ x: 0, y: 0, width: 1280, height: 720 }, image), {
    x: 0,
    y: 0,
    width: 1280,
    height: 720,
  });
});

test('same-label boxes that overlap one another are reviewed as one cluster', () => {
  // Three cars in a row, each hiding part of the next; a truck over the last car; a far car.
  const report = analyzeLayout(
    scene([
      box('c1', 'car', 100, 300, 200, 120),
      box('c2', 'car', 240, 300, 200, 120),
      box('c3', 'car', 380, 300, 200, 120),
      box('truck', 'truck', 500, 280, 300, 160),
      box('far', 'car', 1000, 300, 100, 60),
    ]),
  );
  const cluster = unitOf(report, 'c2');
  assert.equal(cluster.kind, 'cluster');
  assert.deepEqual(
    cluster.members.map((m: any) => m.annotation_id),
    ['c1', 'c2', 'c3'],
  );
  assert.deepEqual(cluster.region, { x: 100, y: 300, width: 480, height: 120 });
  assert.deepEqual(cluster.crop, { x: 28, y: 282, width: 624, height: 156 });
  // Members are placed inside the crop.
  assert.deepEqual(cluster.members[0], {
    annotation_id: 'c1',
    label: 'car',
    x: 72,
    y: 18,
    width: 200,
    height: 120,
  });
  assert.deepEqual(
    cluster.links.map((l: any) => [l.a, l.b, l.relation, l.share_small, l.iou]),
    [
      ['c1', 'c2', 'partial', 0.3, 0.176],
      ['c2', 'c3', 'partial', 0.3, 0.176],
    ],
  );
  // The truck is another label: it stays its own unit but is named as visible in the crop.
  assert.deepEqual(cluster.neighbours, [
    { annotation_id: 'truck', label: 'truck', member: 'c3', iou: 0.154, share_small: 0.4 },
  ]);
  assert.equal(unitOf(report, 'truck').kind, 'single');
  assert.equal(unitOf(report, 'far').kind, 'single');
  assert.match(cluster.advice[0], /cụm 3 box car/);
  assert.equal(report.boxes.find((b) => b.annotation_id === 'c3')!.unit_id, cluster.id);
  assert.equal(report.summary.labels.car.grouped, 3);
});

test('boxes that barely touch stay apart, and the link threshold is a setting', () => {
  const data = scene([box('a', 'car', 0, 0, 100, 100), box('b', 'car', 90, 0, 100, 100)]);
  assert.equal(analyzeLayout(data).units.length, 2);
  assert.equal(analyzeLayout(data, { link_share: 0.1 }).units.length, 1);
});

test('a duplicate, a nested box and a heavy overlap are flagged on their cluster', () => {
  const report = analyzeLayout(
    scene([
      box('a', 'car', 100, 100, 200, 100),
      box('twin', 'car', 104, 102, 200, 100),
      box('b', 'bus', 600, 100, 300, 200),
      box('part', 'bus', 650, 150, 60, 60),
      box('p1', 'person', 100, 400, 60, 150),
      box('p2', 'person', 125, 400, 60, 150),
    ]),
  );
  assert.deepEqual(unitOf(report, 'twin').flags, ['duplicate']);
  assert.deepEqual(unitOf(report, 'part').flags, ['nested']);
  assert.deepEqual(unitOf(report, 'p2').flags, ['heavy_overlap']);
  assert.match(unitOf(report, 'twin').advice.join(' '), /vẽ hai lần/);
  assert.deepEqual(report.summary.links, {
    duplicate: 1,
    nested: 1,
    heavy: 1,
    partial: 0,
    rider: 0,
  });
});

test('a chain longer than the limit breaks at its weakest link', () => {
  // Eight cars; the fourth and fifth overlap least.
  const xs = [0, 100, 200, 300, 460, 560, 660, 760];
  const report = analyzeLayout(scene(xs.map((x, i) => box(`c${i}`, 'car', x, 300, 200, 100))));
  assert.deepEqual(
    report.units.map((u) => u.members.map((m) => m.annotation_id)),
    [
      ['c0', 'c1', 'c2', 'c3'],
      ['c4', 'c5', 'c6', 'c7'],
    ],
  );
  assert.ok(report.units.every((u) => u.flags.includes('chain_cut')));
  assert.deepEqual(report.units[0].neighbours[0], {
    annotation_id: 'c4',
    label: 'car',
    member: 'c3',
    iou: 0.111,
    share_small: 0.2,
  });
  // With room for all eight they are one cluster.
  assert.equal(analyzeLayout(scene(report.boxes.map(asBox)), { max_members: 8 }).units.length, 1);
});
const asBox = (b: any) => box(b.annotation_id, b.label, b.x, b.y, b.width, b.height);

test('a person on a two-wheeler is reviewed together with it', () => {
  const bike = { x: 300, y: 380, width: 160, height: 110 },
    rider = { x: 340, y: 300, width: 70, height: 150 };
  assert.ok(isRider(rider, bike));
  // Beside the bike, or wholly above it, is not riding it.
  assert.ok(!isRider({ ...rider, x: 480 }, bike));
  assert.ok(!isRider({ ...rider, y: 200, height: 185 }, bike));
  const report = analyzeLayout(
    scene([
      box('bike', 'motorcycle', bike.x, bike.y, bike.width, bike.height),
      box('rider', 'person', rider.x, rider.y, rider.width, rider.height),
      box('walker', 'person', 700, 300, 60, 160),
      box('car', 'car', 250, 420, 300, 150),
    ]),
  );
  const unit = unitOf(report, 'rider');
  assert.equal(unit.kind, 'rider');
  assert.deepEqual(unit.labels, ['two_wheeler', 'person']);
  assert.deepEqual(unit.region, { x: 300, y: 300, width: 160, height: 190 });
  assert.deepEqual(
    unit.links.map((l: any) => [l.a, l.b, l.relation]),
    [['bike', 'rider', 'rider']],
  );
  assert.deepEqual(unit.flags, []);
  assert.match(unit.advice[0], /người và xe trong cùng một ảnh cắt/);
  // The car under the bike is another label: named as a neighbour, not merged.
  assert.deepEqual(
    unit.neighbours.map((n: any) => [n.annotation_id, n.member]),
    [['car', 'bike']],
  );
  assert.equal(unitOf(report, 'walker').kind, 'single');
  assert.equal(report.summary.links.rider, 1);
});

test('rider boxes that swallow each other are flagged, and passengers share the vehicle', () => {
  const report = analyzeLayout(
    scene([
      // One box drawn around rider and bike, twice.
      box('bike', 'two_wheeler', 100, 100, 100, 200),
      box('rider', 'person', 105, 100, 95, 190),
      // The bike box holds the whole rider.
      box('bike2', 'two_wheeler', 400, 100, 200, 300),
      box('rider2', 'person', 460, 110, 60, 150),
      // Two people on one bike, next to a second bike with its own rider.
      box('bike3', 'two_wheeler', 800, 400, 160, 110),
      box('front', 'person', 830, 320, 60, 150),
      box('back', 'person', 880, 325, 60, 150),
      box('bike4', 'two_wheeler', 900, 400, 160, 110),
      box('other', 'person', 950, 320, 60, 150),
    ]),
  );
  assert.deepEqual(unitOf(report, 'rider').flags, ['rider_near_identical']);
  assert.deepEqual(unitOf(report, 'rider2').flags, ['vehicle_box_contains_rider']);
  const crowd = unitOf(report, 'front');
  assert.equal(crowd.kind, 'mixed');
  assert.deepEqual(crowd.members.map((m: any) => m.annotation_id).sort(), [
    'back',
    'bike3',
    'bike4',
    'front',
    'other',
  ]);
  // Each person is tied to the one vehicle it overlaps most.
  assert.deepEqual(
    report.units
      .flatMap((u) => u.links)
      .filter((l) => l.relation === 'rider')
      .map((l) => [l.a, l.b])
      .sort(),
    [
      ['bike', 'rider'],
      ['bike2', 'rider2'],
      ['bike3', 'back'],
      ['bike3', 'front'],
      ['bike4', 'other'],
    ],
  );
});

test('boxes that cannot be placed are listed, never dropped silently', () => {
  const report = analyzeLayout(
    scene([
      box('ok', 'car', 10, 10, 50, 50),
      box('flat', 'car', 10, 10, 0, 50),
      { ...box('mask', 'car', 0, 0, 1, 1), geometry: { type: 'mask' } },
      { ...box('lost', 'car', 0, 0, 10, 10), frame_id: 'nowhere' },
      {
        ...box('poly', 'car', 0, 0, 1, 1),
        geometry: {
          type: 'polygon',
          points: [
            [200, 200],
            [300, 220],
            [250, 300],
          ],
        },
      },
    ]),
  );
  assert.deepEqual(report.skipped, [
    { annotation_id: 'flat', reason: 'invalid_box' },
    { annotation_id: 'mask', reason: 'unsupported_geometry' },
    { annotation_id: 'lost', reason: 'missing_image_size' },
  ]);
  const poly = report.boxes.find((b) => b.annotation_id === 'poly')!;
  assert.deepEqual([poly.x, poly.y, poly.width, poly.height], [200, 200, 100, 100]);
  assert.equal(report.config.margin, LAYOUT.margin);
});

test('a dataset ZIP is read, analysed and cut into one image per unit', async () => {
  const { exportCvatImages } = await import('../core/exporters/cvat-images.ts');
  const { ZipWriter } = await import('../server/projects/zip.ts');
  const { cropUnits, readDatasetArchive } = await import('../server/analysis/archive.ts');
  const data = scene([
    box('c1', 'car', 100, 300, 200, 120),
    box('c2', 'car', 240, 300, 200, 120),
    box('bike', 'two_wheeler', 700, 380, 160, 110),
    box('rider', 'person', 740, 300, 70, 150),
    box('sign', 'traffic_sign', 1000, 50, 30, 30),
  ]);
  data.media[0].name = 'street/m.jpg';
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'layout-'));
  try {
    const out = new PassThrough(),
      chunks: Buffer[] = [];
    out.on('data', (c) => chunks.push(c));
    const zip = new ZipWriter(out);
    await zip.add('annotations.xml', Buffer.from(exportCvatImages(data).xml));
    await zip.add(
      'images/street/m.jpg',
      await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#456' } })
        .jpeg()
        .toBuffer(),
    );
    await zip.end();
    const file = path.join(directory, 'dataset.zip');
    await fs.writeFile(file, Buffer.concat(chunks));

    const archive = await readDatasetArchive(file);
    assert.equal(archive.format, 'cvat-images');
    assert.equal(archive.images, 1);
    const report = analyzeLayout(archive.data);
    assert.deepEqual(report.summary.units, { single: 1, cluster: 1, rider: 1, mixed: 0 });
    const written = await cropUnits(archive, report, path.join(directory, 'crops'), {
      outline: true,
    });
    assert.equal(written.size, 3);
    for (const unit of report.units) {
      const target = written.get(unit.id)!;
      assert.equal(path.basename(path.dirname(target)), unit.kind);
      const meta = await sharp(target).metadata();
      assert.equal(meta.width, Math.round(unit.crop.width * unit.scale));
      assert.equal(meta.height, Math.round(unit.crop.height * unit.scale));
    }
    // The sign is 30 px: its crop is the 96 px minimum, enlarged for viewing.
    const sign = report.units.find((u) => u.labels[0] === 'traffic_sign')!;
    assert.deepEqual([sign.crop.width, sign.scale], [96, 2.33]);
    // Only the kinds asked for are cut.
    const some = await cropUnits(archive, report, path.join(directory, 'some'), {
      kinds: ['rider'],
    });
    assert.equal(some.size, 1);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
