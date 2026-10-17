import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { PRESERVED_CONFIGURATION_TABLES, quoteTable, validateResetTarget } from './reset-policy.js';

const databaseFlag = process.argv.indexOf('--database');
const expected = databaseFlag >= 0 ? process.argv[databaseFlag + 1] : undefined;
const confirmed = process.argv.includes('--confirm-clear-business-data');
const target = validateResetTarget(process.env.DATABASE_URL, expected);
if (!confirmed)
  throw new Error(
    'Pass --confirm-clear-business-data to back up and clear this CRM business data.',
  );
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 4000,
  max: 1,
});
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const actual = await client.query('SELECT current_database() AS name');
  if (actual.rows[0].name !== target.database)
    throw new Error('Connected database identity mismatch.');
  const tables = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  );
  const businessTables = tables.rows
    .map((row) => String(row.tablename))
    .filter((name) => !PRESERVED_CONFIGURATION_TABLES.has(name));
  if (!businessTables.length) {
    await client.query('ROLLBACK');
    console.log('No business tables to clear.');
  } else {
    await client.query(
      `LOCK TABLE ${businessTables.map(quoteTable).join(',')} IN ACCESS EXCLUSIVE MODE`,
    );
    const backup: Record<string, unknown> = {
      database: target.database,
      createdAt: new Date().toISOString(),
      tables: {},
    };
    for (const name of businessTables)
      (backup.tables as Record<string, unknown>)[name] = (
        await client.query(`SELECT * FROM ${quoteTable(name)}`)
      ).rows;
    const directory = resolve(process.env.CRM_BACKUP_DIRECTORY ?? '../../backups');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = resolve(directory, `crm-business-${Date.now()}.json`);
    await writeFile(file, JSON.stringify(backup), { mode: 0o600, flag: 'wx' });
    // No CASCADE: unexpected cross-table dependencies abort the transaction.
    await client.query(
      `TRUNCATE TABLE ${businessTables.map(quoteTable).join(',')} RESTART IDENTITY`,
    );
    await client.query('COMMIT');
    console.log(
      JSON.stringify({
        database: target.database,
        clearedTables: businessTables,
        backup: file,
        preserved: [...PRESERVED_CONFIGURATION_TABLES],
      }),
    );
  }
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
