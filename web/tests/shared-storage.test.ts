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
  async upload(key: string, file: string) {
    await fs.mkdir(path.dirname(path.join(this.root, key)), { recursive: true });
    await fs.copyFile(file, path.join(this.root, key));
  }
  async download(key: string, file: string) {
    try {
      await fs.copyFile(path.join(this.root, key), file);
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      return false;
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
test('import publishes the project and another backend opens it from the remote', async () => {
  const id = await importProject();
  const row = await first.row(id);
  assert.equal(row.storage_provider, 'dropbox');
  assert.match(row.storage_key, new RegExp(`^projects/${id}/[a-f0-9-]{36}$`));
  assert.ok(row.storage_synced_at);
  await fs.access(path.join(remote.root, row.storage_key + '.tar'));
  assert.equal('storage_key' in (await first.get(id)), false);

  const { dataset: opened } = await second.context(id);
  assert.equal(opened.meta.dataset_id, (await first.context(id)).dataset.meta.dataset_id);
  const asset = [...opened.assets.values()][0];
  assert.ok(asset.startsWith(path.join(tmp, 'second', row.storage_key)));
  assert.deepEqual(await fs.readFile(asset), png);
  assert.deepEqual(await fs.readdir(path.join(tmp, 'second', '.tmp')), []);
});
test('a backend without the remote explains why shared data is unavailable', async () => {
  const id = await importProject();
  const offline = new ProjectService(pool, path.join(tmp, 'offline'));
  await assert.rejects(offline.context(id), { status: 409 });
});
test('delete removes the remote copy', async () => {
  const id = await importProject();
  assert.deepEqual(await first.remove(id), { deleted: true, cleanupPending: false });
  await assert.rejects(fs.access(path.join(remote.root, 'projects', id)), { code: 'ENOENT' });
});
test('share publishes a project imported before shared storage', async () => {
  const local = new ProjectService(pool, path.join(tmp, 'first'));
  const previous = first.remote;
  first.remote = null;
  let id: string;
  try {
    id = await importProject();
  } finally {
    first.remote = previous;
  }
  assert.equal((await local.row(id)).storage_key, null);
  assert.equal(await first.share(id), true);
  assert.equal(await first.share(id), false);
  const asset = [...(await second.context(id)).dataset.assets.values()][0];
  assert.ok(asset.startsWith(path.join(tmp, 'second', 'projects', id)));
});
