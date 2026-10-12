import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { receiveUpload } from '../server/projects/upload.ts';
import { imageResolver, importDataset } from '../core/importers/index.ts';

// Sends a multipart upload to receiveUpload() and reads it the way the import does: the
// uploaded images give the sizes and are matched to the frames.
async function upload(
  format: string,
  parts: [field: string, name: string, body: string | Buffer][],
) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smartreview-upload-'));
  let result: any, failure: any;
  const server = http.createServer(async (req, res) => {
    try {
      result = await receiveUpload(req as any, path.join(directory, 'in'), format);
    } catch (e) {
      failure = e;
    }
    res.end('ok');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const form = new FormData();
    for (const [field, name, body] of parts) form.append(field, new Blob([body as BlobPart]), name);
    await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`, {
      method: 'POST',
      body: form,
    });
    if (failure) throw failure;
    const sources = await Promise.all(
      [...result.annotations].map(async ([name, file]) => ({
        name,
        text: await fs.readFile(file, 'utf8'),
      })),
    );
    const find = imageResolver(result.media.keys());
    const data = importDataset(format, sources, {
      sizes: (image) => result.dimensions.get(find(image) ?? ''),
    });
    return { data, linked: data.frames.map((f) => find(f.image!.slice('images/'.length))) };
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
}
const png = await fs.readFile(new URL('../fixtures/upload/street.png', import.meta.url));

test('a YOLO upload of several label files is read against the uploaded images', async () => {
  const { data, linked } = await upload('yolo', [
    ['annotation', 'obj.names', 'car\n'],
    ['annotation', 'obj_train_data/street.txt', '0 0.5 0.5 0.25 0.5\n'],
    ['media', 'obj_train_data/street.png', png],
  ]);
  assert.deepEqual(linked, ['obj_train_data/street.png']);
  assert.deepEqual(data.media[0], {
    id: 'image-0',
    name: 'street',
    type: 'image',
    width: 160,
    height: 100,
  });
  assert.deepEqual(data.annotations[0].geometry, {
    type: 'bbox',
    x: 60,
    y: 25,
    width: 40,
    height: 50,
  });
  assert.equal(data.annotations[0].label, 'car');
});

test('a MOT upload links frames to images named by frame number', async () => {
  const { data, linked } = await upload('mot', [
    ['annotation', 'gt/gt.txt', '1,4,10,20,30,40,1,1,1.0\n'],
    ['annotation', 'gt/labels.txt', 'car\n'],
    ['media', 'img1/000001.png', png],
  ]);
  assert.deepEqual(linked, ['img1/000001.png']);
  assert.equal(data.media[0].width, 160);
  assert.equal(data.annotations[0].track_id, '4');
});

test('uploads are held to the format: one file for single-file formats, known extensions', async () => {
  const xml =
    '<annotations><version>1.1</version><image id="0" name="street.png" width="160" height="100"/></annotations>';
  await assert.rejects(
    upload('cvat-images', [
      ['annotation', 'a.xml', xml],
      ['annotation', 'b.xml', xml],
      ['media', 'street.png', png],
    ]),
    { status: 400 },
  );
  await assert.rejects(
    upload('pascal-voc', [
      ['annotation', 'a.json', '{}'],
      ['media', 'street.png', png],
    ]),
    { status: 400 },
  );
  await assert.rejects(upload('made-up', [['media', 'street.png', png]]), { status: 400 });
  const { data } = await upload('cvat-images', [
    ['annotation', 'a.xml', xml],
    ['media', 'street.png', png],
  ]);
  assert.equal(data.frames[0].image, 'images/street.png');
});
