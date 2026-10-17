import type { DatabaseConnectionResult } from '@dcfoundry/db';
import type { ModuleKind, ModuleData, CampaignData } from '@dcfoundry/shared';
import type { WorkspaceActor } from './workspace-store.js';
import { TypedModuleStore } from './typed-module-store.js';
export class WorkspaceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const values = (a: WorkspaceActor) => [a.scope === 'all', a.id, a.scope === 'team', a.teamId];
export class ModuleStore {
  constructor(public pool: DatabaseConnectionResult['pool']) {}
  list(kind: ModuleKind, actor: WorkspaceActor, archived = false, q = '', offset = 0, limit = 100) {
    return new TypedModuleStore(this.pool).list(kind, actor, archived, q, offset, limit);
  }
  get(id: string, kind: ModuleKind, actor: WorkspaceActor) {
    return new TypedModuleStore(this.pool).get(id, kind, actor);
  }
  save(
    kind: ModuleKind,
    actor: WorkspaceActor,
    data: ModuleData,
    leadId: string | null,
    id?: string,
    version?: number,
    archive?: boolean,
  ) {
    return new TypedModuleStore(this.pool).save(kind, actor, data, leadId, id, version, archive);
  }
  versions(id: string, kind: ModuleKind, actor: WorkspaceActor) {
    return new TypedModuleStore(this.pool).versions(id, kind, actor);
  }
  async audit(actor: WorkspaceActor, q = '', offset = 0) {
    return (
      await this.pool.query(
        `SELECT a.id,a.action,a.entity_type AS "entityType",a.entity_id AS "entityId",u.full_name AS "actorName",a.created_at AS "createdAt",a.diff_json AS diff FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE ($1::boolean OR a.actor_id=$2::uuid OR ($3::boolean AND u.team_id=$4::uuid)) AND ($5='' OR a.action ILIKE '%'||$5||'%' OR u.full_name ILIKE '%'||$5||'%') ORDER BY a.created_at DESC,a.id LIMIT 100 OFFSET $6`,
        [...values(actor), q, offset],
      )
    ).rows;
  }
  async importCampaigns(
    actor: WorkspaceActor,
    items: CampaignData[],
    canUpdate: boolean,
    source: 'user' | 'webhook' = 'user',
  ) {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      for (const data of items) {
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          'ads:' + data.account + ':' + data.campaignId + ':' + data.date,
        ]);
        const old = (
          await c.query(
            'SELECT d.*,u.team_id FROM agency_ads_metrics d JOIN users u ON u.id=d.owner_id WHERE d.campaign_id=$1 AND d.account=$2 AND d.metric_date=$3 AND d.archived_at IS NULL FOR UPDATE OF d',
            [data.campaignId, data.account, data.date],
          )
        ).rows[0];
        if (
          old &&
          (!canUpdate ||
            (actor.scope !== 'all' &&
              old.owner_id !== actor.id &&
              !(actor.scope === 'team' && actor.teamId && old.team_id === actor.teamId)))
        )
          throw new WorkspaceError(
            403,
            'Sem permissão para atualizar uma campanha. Lote cancelado.',
          );
        const columns =
          'title,campaign_id,account,metric_date,cost_cents,impressions,clicks,conversions,currency';
        if (old)
          await c.query(
            'INSERT INTO agency_ads_metrics_versions(document_id,version,lead_id,' +
              columns +
              ',actor_id) SELECT id,version,lead_id,' +
              columns +
              ',$2 FROM agency_ads_metrics WHERE id=$1',
            [old.id, actor.id],
          );
        const args = [
          data.title,
          data.campaignId,
          data.account,
          data.date,
          data.costCents,
          data.impressions,
          data.clicks,
          data.conversions,
          data.currency,
        ];
        const row = old
          ? (
              await c.query(
                'UPDATE agency_ads_metrics SET title=$2,campaign_id=$3,account=$4,metric_date=$5,cost_cents=$6,impressions=$7,clicks=$8,conversions=$9,currency=$10,version=version+1,updated_at=now() WHERE id=$1 RETURNING id',
                [old.id, ...args],
              )
            ).rows[0]
          : (
              await c.query(
                'INSERT INTO agency_ads_metrics(owner_id,' +
                  columns +
                  ') VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
                [actor.id, ...args],
              )
            ).rows[0];
        await c.query(
          "INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES($1,$2,'campaign.import','campaign',$3,$4)",
          [
            source,
            actor.id,
            row.id,
            JSON.stringify({ beforeVersion: old?.version ?? null, after: data }),
          ],
        );
      }
      await c.query('COMMIT');
      return { imported: items.length };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
}
