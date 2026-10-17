import type { CrmPool } from './agency-access.js';
import { WorkspaceError } from './module-store.js';
type Connection = { query(sql: string, parameters?: unknown[]): Promise<{ rows: any[] }> };
export async function applyFoundryControl(
  client: Connection,
  id: string,
  paused: boolean,
  revision: number | undefined,
  actorId: string,
) {
  const row = (
    await client.query(
      `UPDATE workspace_leads SET ai_paused=$2,ai_control_revision=ai_control_revision+1,handoff_reason=CASE WHEN $2 THEN 'Atendimento assumido pela equipe' ELSE NULL END WHERE id=$1 AND ($2=true OR ai_control_revision=$3) RETURNING ai_control_revision`,
      [id, paused, revision ?? null],
    )
  ).rows[0];
  if (!row) throw new WorkspaceError(409, 'O controle da Foundry mudou. Atualize a conversa.');
  await client.query(
    `UPDATE wa_commands SET cancelled_at=now() WHERE lead_id=$1 AND ai_revision IS NOT NULL AND cancelled_at IS NULL`,
    [id],
  );
  await client.query(
    `UPDATE wa_messages SET delivery='failed' WHERE lead_id=$1 AND actor_type='foundry' AND delivery='queued'`,
    [id],
  );
  await client.query(
    `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,'foundry.control','lead',$2,$3)`,
    [actorId, id, JSON.stringify({ paused, revision: row.ai_control_revision })],
  );
  return { paused, revision: row.ai_control_revision as number };
}
export async function changeFoundryControl(
  pool: CrmPool,
  id: string,
  paused: boolean,
  revision: number,
  actorId: string,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const state = await applyFoundryControl(client, id, paused, revision, actorId);
    await client.query('COMMIT');
    return state;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
