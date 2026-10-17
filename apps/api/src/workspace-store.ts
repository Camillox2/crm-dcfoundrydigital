import type { DatabaseConnectionResult } from '@dcfoundry/db';
import type { AccessScope, WorkspaceLead, WorkspaceLeadInput } from '@dcfoundry/shared';

export interface WorkspaceActor {
  id: string;
  teamId: string | null;
  scope: AccessScope;
}
export interface WorkspaceStore {
  update?(
    id: string,
    input: WorkspaceLeadInput,
    actor: WorkspaceActor,
  ): Promise<WorkspaceLead | null>;
  archive?(id: string, actor: WorkspaceActor, archived?: boolean): Promise<boolean>;
  list(actor: WorkspaceActor, archived?: boolean): Promise<WorkspaceLead[]>;
  create(input: WorkspaceLeadInput, ownerId: string): Promise<WorkspaceLead>;
  setStage(
    id: string,
    stage: WorkspaceLead['stage'],
    actor: WorkspaceActor,
  ): Promise<WorkspaceLead | null>;
}
const columns = `id, name, company, phone, scope_summary AS "scopeSummary", modality, monthly_value AS "monthlyValue", notes, high_priority AS "highPriority", stage, avatar_url AS "avatarUrl", created_at AS "createdAt", updated_at AS "updatedAt"`;
const access = `($1::boolean OR owner_id=$2::uuid OR ($3::boolean AND owner_id IN (SELECT id FROM users WHERE team_id=$4::uuid)))`;
const actorValues = (actor: WorkspaceActor) => [
  actor.scope === 'all',
  actor.id,
  actor.scope === 'team',
  actor.teamId,
];
function toLead(row: Record<string, unknown>): WorkspaceLead {
  return {
    ...row,
    monthlyValue: Number(row.monthlyValue),
    score: 0,
    temperature: 'Frio',
    campaign: '',
    gclid: '',
    createdAt: new Date(row.createdAt as string).toISOString(),
    updatedAt: new Date(row.updatedAt as string).toISOString(),
  } as WorkspaceLead;
}
export class PostgresWorkspaceStore implements WorkspaceStore {
  constructor(private readonly pool: DatabaseConnectionResult['pool']) {}
  private async change(actorId: string, action: string, sql: string, parameters: unknown[]) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(sql, parameters);
      if (result.rows[0])
        await client.query(
          "INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,$2,'lead',$3,$4)",
          [actorId, action, result.rows[0].id, JSON.stringify({ after: result.rows[0] })],
        );
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async list(actor: WorkspaceActor, archived = false) {
    const result = await this.pool.query(
      `SELECT ${columns} FROM workspace_leads WHERE ${access} AND (archived_at IS NOT NULL)=$5 ORDER BY updated_at DESC LIMIT 500`,
      [...actorValues(actor), archived],
    );
    return result.rows.map(toLead);
  }
  async create(input: WorkspaceLeadInput, ownerId: string) {
    const result = await this.change(
      ownerId,
      'lead.create',
      `INSERT INTO workspace_leads (owner_id,name,company,phone,scope_summary,modality,monthly_value,notes,high_priority) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${columns}`,
      [
        ownerId,
        input.name,
        input.company,
        input.phone,
        input.scopeSummary,
        input.modality,
        input.monthlyValue,
        input.notes,
        input.highPriority,
      ],
    );
    return toLead(result.rows[0]);
  }
  async setStage(id: string, stage: WorkspaceLead['stage'], actor: WorkspaceActor) {
    const result = await this.change(
      actor.id,
      'lead.stage_update',
      `UPDATE workspace_leads SET stage=$6, updated_at=now() WHERE ${access} AND id=$5 AND archived_at IS NULL RETURNING ${columns}`,
      [...actorValues(actor), id, stage],
    );
    return result.rows[0] ? toLead(result.rows[0]) : null;
  }
  async update(id: string, input: WorkspaceLeadInput, actor: WorkspaceActor) {
    const r = await this.change(
      actor.id,
      'lead.update',
      `UPDATE workspace_leads SET name=$6,company=$7,phone=$8,scope_summary=$9,modality=$10,monthly_value=$11,notes=$12,high_priority=$13,updated_at=now() WHERE ${access} AND id=$5 AND archived_at IS NULL RETURNING ${columns}`,
      [
        ...actorValues(actor),
        id,
        input.name,
        input.company,
        input.phone,
        input.scopeSummary,
        input.modality,
        input.monthlyValue,
        input.notes,
        input.highPriority,
      ],
    );
    return r.rows[0] ? toLead(r.rows[0]) : null;
  }
  async archive(id: string, actor: WorkspaceActor, archived = true) {
    const r = await this.change(
      actor.id,
      archived ? 'lead.archive' : 'lead.restore',
      `UPDATE workspace_leads SET archived_at=CASE WHEN $6 THEN now() ELSE NULL END,updated_at=now() WHERE ${access} AND id=$5 AND (archived_at IS NOT NULL)<>$6 RETURNING id`,
      [...actorValues(actor), id, archived],
    );
    return r.rows.length > 0;
  }
}
