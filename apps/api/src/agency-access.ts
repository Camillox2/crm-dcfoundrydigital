import type { FastifyRequest } from 'fastify';
import type { DatabaseConnectionResult } from '@dcfoundry/db';
import { resolveGrantedScope, type PermissionKey } from '@dcfoundry/shared';
import { WorkspaceError } from './module-store.js';
export type CrmPool = DatabaseConnectionResult['pool'];
export function requestActor(req: FastifyRequest, permission: PermissionKey) {
  const user = req.authUser!,
    scope = resolveGrantedScope(user.roles, permission);
  if (!scope) throw new WorkspaceError(403, 'Seu perfil não tem permissão.');
  return { id: user.id, teamId: user.teamId ?? null, scope };
}
export async function scopedLead(
  pool: CrmPool,
  req: FastifyRequest,
  id: string,
  permission: PermissionKey = 'lead:read',
  archived = false,
) {
  const a = requestActor(req, permission);
  const row = (
    await pool.query(
      `SELECT l.* FROM workspace_leads l LEFT JOIN users u ON u.id=l.owner_id WHERE l.id=$1 AND ($2::boolean OR l.owner_id=$3::uuid OR ($4::boolean AND u.team_id=$5::uuid)) AND ($6::boolean OR l.archived_at IS NULL)`,
      [id, a.scope === 'all', a.id, a.scope === 'team', a.teamId, archived],
    )
  ).rows[0];
  if (!row) throw new WorkspaceError(404, 'Contato indisponível ou sem permissão.');
  return row;
}
