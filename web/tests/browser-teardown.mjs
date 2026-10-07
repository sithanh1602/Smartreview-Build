import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { testPool, cleanRevision } from './db-helpers.mjs';
export default async function teardown() {
  const run = process.env.SMARTREVIEW_TEST_RUN;
  if (!/^[a-f0-9-]{36}$/.test(run)) throw new Error('Missing browser cleanup run ID');
  const pool = testPool();
  try {
    for (const port of ['3110', '3111']) {
      const file = path.join(os.tmpdir(), `smartreview-browser-${run}-${port}.jsonl`);
      let records;
      try {
        records = (await fs.readFile(file, 'utf8'))
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(JSON.parse);
      } catch (e) {
        if (e.code === 'ENOENT') continue;
        throw e;
      }
      for (const record of records.filter((r) => r.project)) {
        const [[row]] = await pool.execute('SELECT dataset_revision_id FROM projects WHERE id=?', [
          record.project,
        ]);
        if (!row) continue;
        await pool.execute('DELETE FROM projects WHERE id=?', [record.project]);
        await cleanRevision(pool, row.dataset_revision_id);
      }
      for (const { revision } of records.filter((r) => r.revision))
        await cleanRevision(pool, revision);
      for (const { user } of records.filter((r) => r.user))
        await pool.execute('DELETE FROM users WHERE id=?', [user]);
      for (const { storage } of records.filter((r) => r.storage)) {
        if (
          path.dirname(storage) !== os.tmpdir() ||
          !path.basename(storage).startsWith('smartreview-browser-projects-')
        )
          throw new Error('Invalid cleanup directory');
        await fs.rm(storage, { recursive: true, force: true });
      }
      await fs.unlink(file);
    }
  } finally {
    await pool.end();
  }
}
