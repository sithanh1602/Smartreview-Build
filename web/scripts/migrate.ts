import { createPool } from '../server/db/pool.ts';
import { migrate } from '../server/db/migrate.ts';
const pool = createPool();
try {
  await migrate(pool);
  console.log('SmartReview migrations applied.');
} finally {
  await pool.end();
}
