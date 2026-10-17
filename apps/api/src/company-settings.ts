import type { FastifyInstance } from 'fastify';
import type { DatabaseConnectionResult } from '@dcfoundry/db';
import { CompanyInput } from '@dcfoundry/shared';
import { requirePermission } from './plugins/auth.js';
import { seal, unseal } from './private-fields.js';
import { WorkspaceError } from './module-store.js';
import type { CrmPool } from './agency-access.js';
export async function readCompany(pool: CrmPool) {
  const row = (await pool.query('SELECT * FROM company_settings WHERE singleton=true')).rows[0];
  return row
    ? {
        name: row.name,
        document: unseal(row.document_ciphertext),
        address: row.address,
        email: row.email,
        phone: row.phone,
        representative: row.representative,
        version: row.version,
      }
    : null;
}
export async function registerCompanySettings(
  app: FastifyInstance,
  database: () => Promise<DatabaseConnectionResult> | null,
) {
  const pool = async () => {
    const db = await database();
    if (!db) throw new WorkspaceError(503, 'Configure o PostgreSQL.');
    return db.pool;
  };
  app.get(
    '/api/v1/settings/company',
    { preHandler: [requirePermission('settings:read')] },
    async () => ({ item: await readCompany(await pool()) }),
  );
  app.put(
    '/api/v1/settings/company',
    { preHandler: [requirePermission('settings:update')] },
    async (req) => {
      const input = CompanyInput.parse(req.body),
        db = await pool(),
        client = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(78431023)');
        const before = (
          await client.query('SELECT version FROM company_settings WHERE singleton=true FOR UPDATE')
        ).rows[0];
        if ((before?.version ?? 0) !== input.version)
          throw new WorkspaceError(409, 'Os dados da empresa mudaram. Atualize antes de salvar.');
        const row = (
          await client.query(
            'INSERT INTO company_settings(singleton,name,document_ciphertext,address,email,phone,representative,updated_by) VALUES(true,$1,$2,$3,$4,$5,$6,$7) ON CONFLICT(singleton) DO UPDATE SET name=EXCLUDED.name,document_ciphertext=EXCLUDED.document_ciphertext,address=EXCLUDED.address,email=EXCLUDED.email,phone=EXCLUDED.phone,representative=EXCLUDED.representative,version=company_settings.version+1,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING version',
            [
              input.name,
              seal(input.document),
              input.address,
              input.email,
              input.phone,
              input.representative,
              req.authUser!.id,
            ],
          )
        ).rows[0];
        await client.query(
          `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,'settings.company','settings','company',$2)`,
          [
            req.authUser!.id,
            JSON.stringify({
              configured: true,
              version: row.version,
              fields: ['name', 'document', 'address', 'email', 'phone', 'representative'],
            }),
          ],
        );
        await client.query('COMMIT');
        return { item: { ...input, version: row.version } };
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
  );
}
