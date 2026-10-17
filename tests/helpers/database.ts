import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { vector } from '@electric-sql/pglite-pgvector';
import { readdir, readFile } from 'node:fs/promises';
import type { DatabaseConnectionResult } from '@dcfoundry/db';
// PostgreSQL engine in a disposable WASM database. Never reads DATABASE_URL.
export async function testDatabase() {
  const db = await PGlite.create({ extensions: { pgcrypto, btree_gist, vector } });
  const migrations = new URL('../../packages/db/migrations/', import.meta.url);
  for (const name of (await readdir(migrations)).filter((n) => n.endsWith('.sql')).sort())
    await db.exec(await readFile(new URL(name, migrations), 'utf8'));
  let tail = Promise.resolve();
  const lock = async () => {
    let release!: () => void;
    const previous = tail;
    tail = new Promise<void>((done) => {
      release = done;
    });
    await previous;
    return release;
  };
  const execute = async (sql: string, parameters: unknown[] = []) => {
    const result = await db.query(sql, parameters).catch((error) => {
      throw new Error(`${error.message} — SQL: ${sql}`, { cause: error });
    });
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  };
  const pool = {
    async query(sql: string, parameters?: unknown[]) {
      const release = await lock();
      try {
        return await execute(sql, parameters);
      } finally {
        release();
      }
    },
    async connect() {
      const release = await lock();
      return { query: execute, release };
    },
    async end() {
      await db.close();
    },
  };
  return {
    pool: pool as unknown as DatabaseConnectionResult['pool'],
    db: null as unknown as DatabaseConnectionResult['db'],
    activeTarget: 'primary' as const,
  };
}
