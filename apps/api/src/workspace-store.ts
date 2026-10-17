import type { DatabaseConnectionResult } from '@dcfoundry/db';
import type { AccessScope, WorkspaceLead, WorkspaceLeadInput } from '@dcfoundry/shared';

export interface WorkspaceActor {
  id: string;
  teamId: string | null;
  scope: AccessScope;
}
export interface WorkspaceStore {
  list(actor: WorkspaceActor): Promise<WorkspaceLead[]>;
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
  async list(actor: WorkspaceActor) {
    const result = await this.pool.query(
      `SELECT ${columns} FROM workspace_leads WHERE ${access} ORDER BY updated_at DESC LIMIT 500`,
      actorValues(actor),
    );
    return result.rows.map(toLead);
  }
  async create(input: WorkspaceLeadInput, ownerId: string) {
    const result = await this.pool.query(
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
    const result = await this.pool.query(
      `UPDATE workspace_leads SET stage=$6, updated_at=now() WHERE ${access} AND id=$5 RETURNING ${columns}`,
      [...actorValues(actor), id, stage],
    );
    return result.rows[0] ? toLead(result.rows[0]) : null;
  }
}
