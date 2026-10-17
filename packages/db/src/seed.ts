import { createDatabaseConnection } from './client.js';
import { INITIAL_ROLES_SEED } from './index.js';
import { DEFAULT_PIPELINE_STAGES } from '@dcfoundry/shared';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const { pool } = await createDatabaseConnection(process.env.DATABASE_URL, '');
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const role of INITIAL_ROLES_SEED)
    await client.query(
      'INSERT INTO roles(slug,display_name,permissions_json) VALUES($1,$2,$3) ON CONFLICT(slug) DO NOTHING',
      [role.slug, role.displayName, JSON.stringify(role.permissionsJson)],
    );
  const pipeline = await client.query(
    "INSERT INTO pipelines(name,slug,is_default) VALUES('Comercial DC Foundry','comercial',true) ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name RETURNING id",
  );
  for (const [index, stage] of DEFAULT_PIPELINE_STAGES.entries())
    await client.query(
      'INSERT INTO pipeline_stages(pipeline_id,slug,name,position,is_won,is_lost,color_hex,sla_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(pipeline_id,slug) DO NOTHING',
      [
        pipeline.rows[0].id,
        stage.id,
        stage.name,
        index + 1,
        stage.isWon,
        stage.isLost,
        stage.color,
        stage.slaMinutes,
      ],
    );
  await client.query('COMMIT');
  console.log(
    'Configuration initialized. No clients, products, contracts, invoices or campaigns were seeded.',
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
