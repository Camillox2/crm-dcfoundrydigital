import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { createDatabaseConnection } from './client.js';

if (!process.env.DATABASE_URL)
  throw new Error('DATABASE_URL is required. No fallback database will be used.');
const { pool } = await createDatabaseConnection(process.env.DATABASE_URL, '');
const client = await pool.connect();
try {
  await client.query('SELECT pg_advisory_lock(78431021)');
  await client.query(
    'CREATE TABLE IF NOT EXISTS crm_schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const directory = new URL('../migrations/', import.meta.url);
  for (const name of (await readdir(directory))
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort()) {
    const sql = await readFile(new URL(name, directory), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const applied = await client.query('SELECT checksum FROM crm_schema_migrations WHERE name=$1', [
      name,
    ]);
    if (applied.rows.length) {
      if (applied.rows[0].checksum !== checksum)
        throw new Error(`Migration checksum changed: ${name}`);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO crm_schema_migrations(name,checksum) VALUES($1,$2)', [
        name,
        checksum,
      ]);
      await client.query('COMMIT');
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.query('SELECT pg_advisory_unlock(78431021)');
  client.release();
  await pool.end();
}
