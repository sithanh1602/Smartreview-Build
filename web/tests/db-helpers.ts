import { createPool } from '../server/db/pool.ts';
import type { Db } from '../server/types.ts';

export function testPool() {
  const name = process.env.TEST_DB_NAME || 'smartreview_test';
  if (
    !/^smartreview_test(?:_[a-z0-9]+)?$/.test(name) ||
    name === (process.env.DB_NAME || 'smartreview')
  )
    throw new Error('Tests require a separate smartreview_test database.');
  return createPool({ database: name });
}
export async function cleanRevision(pool: Db, id: number | null | undefined) {
  if (!id) return;
  await pool.execute(
    'DELETE d FROM review_decisions d JOIN risk_cases c ON d.risk_case_id=c.id WHERE c.dataset_revision_id=?',
    [id],
  );
  await pool.execute('DELETE FROM risk_cases WHERE dataset_revision_id=?', [id]);
  await pool.execute('DELETE FROM dataset_revisions WHERE id=?', [id]);
}
