import type { AddressInfo } from 'node:net';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ProjectService } from '../server/projects/service.ts';
import { createApp } from './app-helper.ts';
import { migrate } from '../server/db/migrate.ts';
import { testPool, cleanRevision } from './db-helpers.ts';
import { webRoot } from '../server/config.ts';
import type { RemoteStorage } from '../server/storage/remote.ts';

// Stands in for Dropbox: a directory that both backends can reach.
class FolderRemote implements RemoteStorage {
  name = 'dropbox' as const;
  root: string;
  constructor(root: string) {
    this.root = root;
  }
  async write(key: string, data: Uint8Array<ArrayBuffer>) {
    await fs.mkdir(path.dirname(path.join(this.root, key)), { recursive: true });
    await fs.writeFile(path.join(this.root, key), data);
  }
  async uploadFiles(files: { key: string; file: string }[]) {
    for (const f of files) await this.write(f.key, await fs.readFile(f.file));
  }
  async read(key: string) {
    try {
      return await fs.readFile(path.join(this.root, key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      return null;
    }
  }
  async remove(key: string) {
    await fs.rm(path.join(this.root, key), { recursive: true, force: true });
  }
}
let pool, tmp, remote, first, second, server, base;
const ids = [];
const dataset = await fs.readFile(new URL('../fixtures/upload/dataset.json', import.meta.url));
const png = await fs.readFile(new URL('../fixtures/upload/street.png', import.meta.url));
async function importProject() {
  const created = await fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Shared storage', format: 'smartreview-json' }),
  });
  const project = await created.json();
  ids.push(project.id);
  const form = new FormData();
  form.append('annotation', new Blob([dataset]), 'dataset.json');
  form.append('media', new Blob([png]), 'street.png');
  const res = await fetch(`${base}/api/projects/${project.id}/import`, {
    method: 'POST',
    body: form,
  });
  assert.equal(res.status, 201);
  return project.id as string;
}
before(async () => {
  pool = testPool();
  await migrate(pool);
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'smartreview-shared-'));
  remote = new FolderRemote(path.join(tmp, 'remote'));
  first = new ProjectService(pool, path.join(tmp, 'first'), remote);
  second = new ProjectService(pool, path.join(tmp, 'second'), remote);
  server = createApp({ projects: first, distRoot: path.join(webRoot, 'dist') });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  for (const id of ids) {
    const [[row]] = await pool.execute('SELECT * FROM projects WHERE id=?', [id]);
    if (!row) continue;
    await pool.execute('DELETE FROM projects WHERE id=?', [id]);
    await cleanRevision(pool, row.dataset_revision_id);
  }
  if (pool) await pool.end();
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
});
const missing = (file: string) => assert.rejects(fs.access(file), { code: 'ENOENT' });
test('import keeps nothing on disk and another backend reads the project from the remote', async () => {
  const id = await importProject();
  const row = await first.row(id);
  assert.equal(row.storage_provider, 'dropbox');
  assert.match(row.storage_key, new RegExp(`^projects/${id}/[a-f0-9-]{36}$`));
  assert.ok(row.storage_synced_at);
  assert.equal(row.dataset_path, null);
  assert.equal('storage_key' in (await first.get(id)), false);
  await fs.access(path.join(remote.root, row.storage_key, 'dataset.json'));
  await fs.access(path.join(remote.root, row.storage_key, 'risk', 'report.json'));
  assert.deepEqual(
    await fs.readFile(path.join(remote.root, row.storage_key, 'media', 'street.png')),
    png,
  );
  await missing(path.join(tmp, 'first', 'projects', id));

  const { dataset: own } = await first.context(id);
  const { dataset: opened } = await second.context(id);
  assert.equal(opened.remote, true);
  assert.equal(opened.meta.dataset_id, own.meta.dataset_id);
  const frame = [...opened.assets.keys()][0];
  assert.deepEqual(await opened.readAsset(frame), png);
  await missing(path.join(tmp, 'second'));

  const url = own.allCases
    .map((c) => (Object.values(c.context)[0] as any)?.image_url)
    .find(Boolean);
  const served = await fetch(base + url);
  assert.equal(served.status, 200);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), png);
});
test('a backend without the remote explains why shared data is unavailable', async () => {
  const id = await importProject();
  const offline = new ProjectService(pool, path.join(tmp, 'offline'));
  await assert.rejects(offline.context(id), { status: 409 });
});
test('delete removes the remote copy', async () => {
  const id = await importProject();
  assert.deepEqual(await first.remove(id), { deleted: true, cleanupPending: false });
  await missing(path.join(remote.root, 'projects', id));
});
test('share moves a locally stored project to the remote', async () => {
  const previous = first.remote;
  first.remote = null;
  let id: string;
  try {
    id = await importProject();
  } finally {
    first.remote = previous;
  }
  const before = await first.row(id);
  assert.equal(before.storage_key, null);
  await fs.access(before.dataset_path);
  first.cache.delete(id);
  assert.equal(await first.share(id), true);
  assert.equal(await first.share(id), false);
  const row = await first.row(id);
  assert.equal(row.dataset_path, null);
  await missing(path.join(tmp, 'first', 'projects', id));
  const { dataset: opened } = await second.context(id);
  assert.deepEqual(await opened.readAsset([...opened.assets.keys()][0]), png);
});
