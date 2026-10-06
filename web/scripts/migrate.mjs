import { createPool } from '../server/db/pool.mjs';
import { migrate } from '../server/db/migrate.mjs';
const pool = createPool();
try {
  await migrate(pool);
  console.log('SmartReview migrations applied.');
} finally {
  await pool.end();
}
