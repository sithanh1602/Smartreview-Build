import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMAT_SPECS,
  detectFormats,
  imageResolver,
  importAnnotations,
} from '../core/importers/index.ts';

const sizes = () => ({ width: 200, height: 100 });
const box = (a) => a.geometry;

test('CVAT for video reads tracks by frame, skips outside shapes and keeps the track', () => {
  const xml = `<annotations><version>1.1</version>
    <meta><task><name>clip</name><original_size><width>640</width><height>480</height></original_size></task></meta>
    <track id="3" label="car" source="manual">
      <box frame="0" xtl="10" ytl="20" xbr="50" ybr="80" outside="0" occluded="1" keyframe="1"><attribute name="score">0.4</attribute></box>
      <box frame="1" xtl="12" ytl="20" xbr="52" ybr="80" outside="0" occluded="0" keyframe="0"/>
      <box frame="2" xtl="12" ytl="20" xbr="52" ybr="80" outside="1" occluded="0" keyframe="1"/>
    </track></annotations>`;
  const data = importAnnotations('cvat-video', xml);
  assert.deepEqual(data.media, [
    { id: 'video', name: 'clip', type: 'video', width: 640, height: 480 },
  ]);
  assert.deepEqual(
    data.frames.map((f) => [f.index, f.image]),
    [
      [0, 'images/frame_000000'],
      [1, 'images/frame_000001'],
    ],
  );
  const [a, b] = data.annotations;
  assert.deepEqual(box(a), { type: 'bbox', x: 10, y: 20, width: 40, height: 60 });
  assert.equal(a.track_id, '3');
  assert.equal(a.confidence, 0.4);
  assert.equal(a.source.kind, 'human');
  assert.equal(a.attributes.occluded, true);
  assert.equal(b.frame_id, 'video:1');
  assert.throws(
    () =>
      importAnnotations(
        'cvat-video',
        '<annotations><version>1.1</version><image id="0" name="a.png" width="1" height="1"/></annotations>',
      ),
    /CVAT for images/,
  );
});

test('Datumaro reads boxes and polygons, takes sizes as [height, width], skips other types', () => {
  const data = importAnnotations(
    'datumaro',
    JSON.stringify({
      categories: { label: { labels: [{ name: 'car' }, { name: 'bus' }] } },
      items: [
        {
          id: 'a',
          image: { path: 'a.jpg', size: [100, 200] },
          annotations: [
            { type: 'bbox', bbox: [1, 2, 30, 40], label_id: 1, attributes: { score: 0.9 } },
            { type: 'polygon', points: [0, 0, 10, 0, 10, 10], label_id: 0 },
            { type: 'label', label_id: 0 },
          ],
        },
        { id: 'sub/b', annotations: [] },
      ],
    }),
    { sizes },
  );
  assert.deepEqual(data.media[0], {
    id: 'image-0',
    name: 'a.jpg',
    type: 'image',
    width: 200,
    height: 100,
  });
  assert.equal(data.frames[1].image, 'images/sub/b');
  assert.equal(data.annotations.length, 2);
  assert.equal(data.annotations[0].label, 'bus');
  assert.equal(data.annotations[0].confidence, 0.9);
  assert.deepEqual((data.annotations[1].geometry as any).points, [
    [0, 0],
    [10, 0],
    [10, 10],
  ]);
});

test('PASCAL VOC reads one XML per image with its flags', () => {
  const xml = (name, objects) =>
    `<annotation><folder>x</folder><filename>${name}</filename><size><width>200</width><height>100</height><depth>3</depth></size>${objects}</annotation>`;
  const data = importAnnotations('pascal-voc', [
    {
      name: 'Annotations/a.xml',
      text: xml(
        'a.jpg',
        '<object><name>car</name><truncated>1</truncated><occluded>0</occluded><difficult>0</difficult><bndbox><xmin>10</xmin><ymin>20</ymin><xmax>60</xmax><ymax>90</ymax></bndbox><attributes><attribute><name>score</name><value>0.25</value></attribute></attributes></object>',
      ),
    },
    { name: 'Annotations/b.xml', text: xml('b.jpg', '') },
  ]);
  assert.equal(data.frames.length, 2);
  assert.equal(data.frames[0].image, 'images/a.jpg');
  const [a] = data.annotations;
  assert.deepEqual(box(a), { type: 'bbox', x: 10, y: 20, width: 50, height: 70 });
  assert.equal(a.attributes.truncated, true);
  assert.equal(a.confidence, 0.25);
  assert.throws(
    () =>
      importAnnotations('pascal-voc', [
        { name: 'a.xml', text: xml('a.jpg', '') },
        { name: 'b.xml', text: xml('a.jpg', '') },
      ]),
    /cùng trỏ tới ảnh/,
  );
});

test('LabelMe reads polygons, bounding boxes and skips deleted objects', () => {
  const pt = (x, y) => `<pt><x>${x}</x><y>${y}</y></pt>`;
  const data = importAnnotations('labelme', [
    {
      name: 'a.xml',
      text: `<annotation><filename>a.jpg</filename><imagesize><nrows>100</nrows><ncols>200</ncols></imagesize>
        <object><name>car</name><deleted>0</deleted><type>bounding_box</type><polygon>${pt(10, 20)}${pt(60, 20)}${pt(60, 90)}${pt(10, 90)}</polygon></object>
        <object><name>road</name><deleted>0</deleted><polygon>${pt(0, 0)}${pt(5, 0)}${pt(5, 5)}</polygon></object>
        <object><name>gone</name><deleted>1</deleted><polygon>${pt(0, 0)}${pt(5, 0)}${pt(5, 5)}</polygon></object></annotation>`,
    },
  ]);
  assert.deepEqual(data.media[0], {
    id: 'image-0',
    name: 'a.jpg',
    type: 'image',
    width: 200,
    height: 100,
  });
  assert.deepEqual(
    data.annotations.map((a) => [a.label, a.geometry.type]),
    [
      ['car', 'bbox'],
      ['road', 'polygon'],
    ],
  );
  assert.deepEqual(box(data.annotations[0]), { type: 'bbox', x: 10, y: 20, width: 50, height: 70 });
});

test('YOLO turns fractions into pixels and reads names, confidence, polygons and empty files', () => {
  const files = [
    { name: 'obj.names', text: 'car\nbus\n' },
    {
      name: 'obj_train_data/a.txt',
      text: '1 0.5 0.5 0.2 0.4\n0 0.25 0.5 0.1 0.2 0.8\n0 0 0 0.5 0 0.5 1\n',
    },
    { name: 'obj_train_data/b.txt', text: '' },
    { name: 'train.txt', text: 'data/obj_train_data/a.jpg\n' },
  ];
  const asked = [];
  const data = importAnnotations('yolo', files, {
    sizes: (image) => {
      asked.push(image);
      return sizes();
    },
  });
  assert.deepEqual(asked, ['a', 'b']);
  assert.deepEqual(
    data.frames.map((f) => f.image),
    ['images/a', 'images/b'],
  );
  const [a, b, c] = data.annotations;
  assert.equal(a.label, 'bus');
  assert.deepEqual(box(a), { type: 'bbox', x: 80, y: 30, width: 40, height: 40 });
  assert.equal(a.confidence, undefined);
  assert.equal(b.confidence, 0.8);
  assert.deepEqual(c.geometry, {
    type: 'polygon',
    points: [
      [0, 0],
      [100, 0],
      [100, 100],
    ],
  });
  const yaml = importAnnotations(
    'yolo',
    [
      { name: 'data.yaml', text: 'path: .\ntrain: images/train\nnames:\n  0: person\n  1: car\n' },
      { name: 'labels/train/a.txt', text: '1 0.5 0.5 1 1\n' },
      { name: 'labels/val/a.txt', text: '0 0.5 0.5 1 1\n' },
    ],
    { sizes },
  );
  assert.deepEqual(
    yaml.annotations.map((x) => x.label),
    ['car', 'person'],
  );
  // The same file name in two splits keeps its folder, with labels/ read as images/.
  assert.deepEqual(
    yaml.frames.map((f) => f.image),
    ['images/images/train/a', 'images/images/val/a'],
  );
  assert.throws(() => importAnnotations('yolo', files), /không ghi kích thước ảnh/);
});

test('KITTI reads pixel boxes, skips DontCare and takes the optional score', () => {
  const data = importAnnotations(
    'kitti',
    [
      {
        name: 'label_2/000001.txt',
        text: 'Car 0.00 1 -1.5 10.0 20.0 60.0 90.0 1.5 1.6 3.7 1 1 10 0.1 0.75\nDontCare -1 -1 -10 0 0 5 5 -1 -1 -1 -1000 -1000 -1000 -10\n',
      },
    ],
    { sizes },
  );
  assert.equal(data.frames[0].image, 'images/000001');
  assert.equal(data.annotations.length, 1);
  assert.deepEqual(box(data.annotations[0]), { type: 'bbox', x: 10, y: 20, width: 50, height: 70 });
  assert.equal(data.annotations[0].confidence, 0.75);
  assert.equal(data.annotations[0].attributes.occluded, 1);
});

test('MOT reads tracks from gt.txt with class names and ignored rows', () => {
  const data = importAnnotations(
    'mot',
    [
      {
        name: 'gt/gt.txt',
        text: '1,7,10,20,50,70,1,2,1.0\n2,7,12,20,50,70,1,2,0.5\n2,8,0,0,5,5,0,1,1.0\n',
      },
      { name: 'gt/labels.txt', text: 'person\ncar\n' },
    ],
    { sizes },
  );
  assert.deepEqual(
    data.frames.map((f) => [f.index, f.image]),
    [
      [1, 'images/000001'],
      [2, 'images/000002'],
    ],
  );
  assert.equal(data.annotations.length, 2);
  assert.equal(data.annotations[0].label, 'car');
  assert.equal(data.annotations[1].track_id, '7');
  assert.equal(data.media[0].type, 'video');
});

test('formats are told apart by content, and per-image files are gathered into one set', () => {
  const found = detectFormats([
    {
      name: 'annotations.xml',
      text: '<annotations><version>1.1</version><image id="0" name="a.png" width="1" height="1"/></annotations>',
    },
    {
      name: 'video.xml',
      text: '<annotations><version>1.1</version><track id="0" label="car"/></annotations>',
    },
    {
      name: 'Annotations/a.xml',
      text: '<annotation><filename>a.jpg</filename><size><width>1</width></size></annotation>',
    },
    {
      name: 'Annotations/b.xml',
      text: '<annotation><filename>b.jpg</filename><object><bndbox/></object></annotation>',
    },
    {
      name: 'lm/c.xml',
      text: '<annotation><filename>c.jpg</filename><imagesize><nrows>1</nrows></imagesize></annotation>',
    },
    { name: 'default.json', text: '{"categories":{},"items":[]}' },
    { name: 'instances.json', text: '{"images":[],"categories":[],"annotations":[]}' },
    { name: 'obj.names', text: 'car' },
    { name: 'obj_train_data/a.txt', text: '0 0.5 0.5 0.1 0.1' },
    { name: 'obj_train_data/b.txt', text: '' },
    { name: 'train.txt', text: 'a.jpg' },
    { name: 'gt/gt.txt', text: '1,1,0,0,5,5,1,1,1' },
    { name: 'notes.txt', text: 'hello world' },
  ]);
  assert.deepEqual(
    found.map((c) => [c.format, c.files.map((f) => f.name)]),
    [
      ['cvat-images', ['annotations.xml']],
      ['cvat-video', ['video.xml']],
      ['datumaro', ['default.json']],
      ['coco-detection', ['instances.json']],
      ['pascal-voc', ['Annotations/a.xml', 'Annotations/b.xml']],
      ['yolo', ['obj.names', 'obj_train_data/a.txt', 'train.txt', 'obj_train_data/b.txt']],
      ['labelme', ['lm/c.xml']],
      ['mot', ['gt/gt.txt']],
    ],
  );
  const kitti = detectFormats([{ name: 'label_2/1.txt', text: 'Car 0 0 0 1 2 3 4 1 1 1 1 1 1 1' }]);
  assert.equal(kitti[0].format, 'kitti');
  assert.deepEqual(Object.keys(FORMAT_SPECS).length, 10);
});

test('images are found by path, unique name, then by name without extension', () => {
  const find = imageResolver([
    'images/train/a.jpg',
    'images/val/a.jpg',
    'x/b.png',
    'frame_000003.PNG',
  ]);
  assert.equal(find('images/train/a.jpg'), 'images/train/a.jpg');
  assert.equal(find('b.png'), 'x/b.png');
  assert.equal(find('a.jpg'), null);
  assert.equal(find('images/val/a'), 'images/val/a.jpg');
  assert.equal(find('b'), 'x/b.png');
  assert.equal(find('frame_000003'), 'frame_000003.PNG');
  assert.equal(find('missing'), null);
  assert.equal(find('b.jpg'), null);
});
