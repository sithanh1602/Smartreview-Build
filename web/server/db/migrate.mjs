import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
export async function migrate(pool) {
  const connection = await pool.getConnection();
  try {
    const [[lock]] = await connection.query(
      "SELECT GET_LOCK(CONCAT(DATABASE(), ':smartreview:migrate'), 15) AS acquired",
    );
    if (lock.acquired !== 1) throw new Error('Migration lock unavailable');
    await connection.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB',
    );
    const directory = new URL('./migrations/', import.meta.url);
    for (const file of (await fs.readdir(directory)).filter((f) => f.endsWith('.sql')).sort()) {
      const sql = await fs.readFile(new URL(file, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const [existing] = await connection.execute(
        'SELECT checksum FROM schema_migrations WHERE version=?',
        [file],
      );
      if (existing.length) {
        if (existing[0].checksum !== checksum)
          throw new Error(`Applied migration changed: ${file}`);
        continue;
      }
      // These initial DDL statements are idempotent so an interrupted migration can resume.
      for (const statement of sql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean))
        await connection.query(statement);
      await connection.execute('INSERT INTO schema_migrations(version,checksum) VALUES (?,?)', [
        file,
        checksum,
      ]);
    }
  } finally {
    try {
      await connection.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':smartreview:migrate'))");
    } finally {
      connection.release();
    }
  }
}
