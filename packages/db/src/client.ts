import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import * as agencySchema from './agency-schema.js';
const completeSchema = { ...schema, ...agencySchema };

const { Pool } = pg;

export interface DatabaseConnectionResult {
  db: NodePgDatabase<typeof completeSchema>;
  pool: pg.Pool;
  activeTarget: 'primary' | 'fallback';
}

/**
 * Inicializa conexão PostgreSQL priorizando DATABASE_URL (Neon em produção)
 * e realizando fallback automático para DATABASE_FALLBACK_URL (Postgres Docker local).
 */
export async function createDatabaseConnection(
  primaryUrl = process.env.DATABASE_URL,
  fallbackUrl = process.env.DATABASE_FALLBACK_URL,
): Promise<DatabaseConnectionResult> {
  const targetPrimary =
    primaryUrl ?? 'postgresql://dcfoundry:dcfoundry_local_dev@localhost:5432/dcfoundry_crm';

  const primaryPool = new Pool({
    connectionString: targetPrimary,
    max: Math.max(1, Math.min(20, Number(process.env.CRM_DB_POOL_SIZE) || 10)),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 4_000,
  });

  try {
    const client = await primaryPool.connect();
    client.release();
    return {
      db: drizzle(primaryPool, { schema: completeSchema }),
      pool: primaryPool,
      activeTarget: 'primary',
    };
  } catch (primaryErr) {
    await primaryPool.end().catch(() => undefined);

    if (!fallbackUrl || fallbackUrl === targetPrimary) {
      throw primaryErr;
    }

    const fallbackPool = new Pool({
      connectionString: fallbackUrl,
      max: Math.max(1, Math.min(20, Number(process.env.CRM_DB_POOL_SIZE) || 10)),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 4_000,
    });

    const client = await fallbackPool.connect();
    client.release();
    return {
      db: drizzle(fallbackPool, { schema: completeSchema }),
      pool: fallbackPool,
      activeTarget: 'fallback',
    };
  }
}
