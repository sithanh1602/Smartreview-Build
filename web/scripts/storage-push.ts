import path from 'node:path';
import { createPool } from '../server/db/pool.ts';
import { webRoot } from '../server/config.ts';
import { ProjectService } from '../server/projects/service.ts';
import { remoteStorageFromEnv } from '../server/storage/remote.ts';

// Publishes projects imported on this machine before shared storage existed.
const remote = remoteStorageFromEnv();
if (!remote) throw new Error('Set SMARTREVIEW_REMOTE_STORAGE in .env first.');
const pool = createPool();
try {
  const projects = new ProjectService(
    pool,
    process.env.SMARTREVIEW_STORAGE || path.join(webRoot, 'storage'),
    remote,
  );
  let pushed = 0;
  for (const p of await projects.list()) {
    if (!(await projects.share(p.id))) continue;
    pushed++;
    console.log(`Pushed ${p.id} · ${p.name}`);
  }
  console.log(`${pushed} project(s) pushed to ${remote.name}.`);
} finally {
  await pool.end();
}
