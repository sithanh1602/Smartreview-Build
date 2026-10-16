import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapCvat3D } from '../server/cvat/mapper3d.ts';
const data = () => ({
  job: { id: 2, dimension: '3d', start_frame: 4, stop_frame: 6 },
  meta: {},
  labels: [{ id: 1, name: 'car' }],
  annotations: {
    shapes: [
      { id: 7, label_id: 1, type: 'cuboid', frame: 4, points: [10, 2, 1, 0, 0, 1.2, 4, 2, 1.5] },
    ],
    tracks: [] as any[],
  },
});
test('CVAT cuboids preserve XYZ, dimensions, radians and nonzero job frame', () => {
  const m = mapCvat3D(data());
  const b = m.scene.frames[0].boxes[0];
  assert.deepEqual(b.center, [10, 2, 1]);
  assert.deepEqual(b.size, [4, 2, 1.5]);
  assert.equal(b.heading, 1.2);
  assert.equal(b.type, 'VEHICLE');
  assert.equal(m.scene.frames[0].timestamp, 4);
  assert.equal(m.sources.get('4:shape:7')?.object_id, '7');
});
test('unsupported roll and invalid size are explicitly skipped', () => {
  const d = data();
  d.annotations.shapes[0].points[3] = 0.4;
  assert.equal(mapCvat3D(d).skipped.length, 1);
  d.annotations.shapes[0].points[3] = 0;
  d.annotations.shapes[0].points[6] = -1;
  assert.equal(mapCvat3D(d).scene.frames[0].boxes.length, 0);
});
test('track keys survive; outside and unverified interpolation are not invented', () => {
  const d = data();
  d.annotations.tracks = [
    {
      id: 8,
      label_id: 1,
      shapes: [
        { ...d.annotations.shapes[0] },
        { ...d.annotations.shapes[0], frame: 6, outside: true },
      ],
    },
  ];
  d.annotations.shapes = [];
  const m = mapCvat3D(d);
  assert.equal(m.scene.frames[0].boxes[0].id, 'track:8');
  assert.equal(m.scene.frames[1].boxes.length, 0);
  assert.equal(m.scene.frames[2].boxes.length, 0);
  assert.ok(m.skipped[0].reason.includes('nội suy'));
});
test('filtered frames fail rather than silently misalign geometry', () => {
  const d = data();
  d.meta = { frame_filter: 'step=2' };
  assert.throws(() => mapCvat3D(d), /frame filter/);
});
