import type { DatabaseConnectionResult } from '@dcfoundry/db';
import type {
  ModuleKind,
  ModuleData,
  WorkspaceDocument,
  BlogData,
  CampaignData,
} from '@dcfoundry/shared';
import type { WorkspaceActor } from './workspace-store.js';
import { TypedModuleStore, typedModules } from './typed-module-store.js';

export class WorkspaceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const scope = `($1::boolean OR d.owner_id=$2::uuid OR ($3::boolean AND d.owner_id IN (SELECT id FROM users WHERE team_id=$4::uuid)))`;
const values = (a: WorkspaceActor) => [a.scope === 'all', a.id, a.scope === 'team', a.teamId];
const columns = `d.id,d.kind,d.owner_id AS "ownerId",d.lead_id AS "leadId",d.data,d.version,d.archived_at AS "archivedAt",d.published_at AS "publishedAt",d.sync_status AS "syncStatus",d.created_at AS "createdAt",d.updated_at AS "updatedAt"`;
const map = (row: Record<string, unknown>) =>
  ({
    ...row,
    createdAt: new Date(row.createdAt as string).toISOString(),
    updatedAt: new Date(row.updatedAt as string).toISOString(),
    archivedAt: row.archivedAt ? new Date(row.archivedAt as string).toISOString() : null,
    publishedAt: row.publishedAt
      ? new Date(row.publishedAt as string).toISOString()
      : row.kind === 'blog' &&
          (row.data as BlogData).status === 'scheduled' &&
          Date.parse((row.data as BlogData).scheduledAt) <= Date.now()
        ? (row.data as BlogData).scheduledAt
        : null,
  }) as unknown as WorkspaceDocument;
export class ModuleStore {
  constructor(public pool: DatabaseConnectionResult['pool']) {}
  async list(
    kind: ModuleKind,
    actor: WorkspaceActor,
    archived = false,
    q = '',
    offset = 0,
    limit = 100,
  ) {
    if (typedModules[kind])
      return new TypedModuleStore(this.pool).list(kind, actor, archived, q, offset, limit);
    const args = [...values(actor), kind, archived, q, offset, limit];
    const where = `${scope} AND d.kind=$5 AND (d.archived_at IS NOT NULL)=$6 AND ($7='' OR d.data->>'title' ILIKE '%'||$7||'%' OR d.data->>'client' ILIKE '%'||$7||'%')`;
    const result = await this.pool.query(
      `SELECT ${columns},count(*) OVER() AS total FROM workspace_documents d WHERE ${where} ORDER BY d.updated_at DESC,d.id LIMIT $9 OFFSET $8`,
      args,
    );
    const count = await this.pool.query(
      `SELECT count(*) AS total FROM workspace_documents d WHERE ${where}`,
      args.slice(0, 7),
    );
    return { items: result.rows.map(map), total: Number(count.rows[0]?.total ?? 0) };
  }
  async get(id: string, kind: ModuleKind, actor: WorkspaceActor) {
    if (typedModules[kind]) return new TypedModuleStore(this.pool).get(id, kind, actor);
    const r = await this.pool.query(
      `SELECT ${columns} FROM workspace_documents d WHERE ${scope} AND d.id=$5 AND d.kind=$6`,
      [...values(actor), id, kind],
    );
    if (!r.rows[0]) throw new WorkspaceError(404, 'Registro não encontrado ou sem permissão.');
    return map(r.rows[0]);
  }
  async save(
    kind: ModuleKind,
    actor: WorkspaceActor,
    data: ModuleData,
    leadId: string | null,
    id?: string,
    version?: number,
    archive?: boolean,
  ) {
    if (typedModules[kind])
      return new TypedModuleStore(this.pool).save(kind, actor, data, leadId, id, version, archive);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      let before: WorkspaceDocument | undefined;
      if (id) {
        const r = await client.query(
          `SELECT ${columns} FROM workspace_documents d WHERE ${scope} AND d.id=$5 AND d.kind=$6 FOR UPDATE`,
          [...values(actor), id, kind],
        );
        if (!r.rows[0]) throw new WorkspaceError(404, 'Registro não encontrado ou sem permissão.');
        before = map(r.rows[0]);
        if (before.version !== version)
          throw new WorkspaceError(
            409,
            'Este registro foi alterado em outra tela. Atualize antes de salvar.',
          );
      }
      if (leadId) {
        const lead = await client.query(
          `SELECT l.id FROM workspace_leads l LEFT JOIN users u ON u.id=l.owner_id WHERE l.id=$1 AND ($2::boolean OR l.owner_id=$3::uuid OR ($4::boolean AND u.team_id=$5::uuid))`,
          [leadId, actor.scope === 'all', actor.id, actor.scope === 'team', actor.teamId],
        );
        if (!lead.rows.length) throw new WorkspaceError(404, 'Contato vinculado indisponível.');
      }
      if (
        kind === 'blog' &&
        before?.publishedAt &&
        (before.data as BlogData).slug !== (data as BlogData).slug
      )
        throw new WorkspaceError(
          409,
          'A URL de um artigo já publicado deve ser preservada. Duplique o artigo para uma nova URL.',
        );
      if (kind === 'blog') {
        const duplicate = await client.query(
          "SELECT id FROM workspace_documents WHERE kind='blog' AND data->>'slug'=$1 AND ($2::uuid IS NULL OR id<>$2::uuid) LIMIT 1",
          [(data as BlogData).slug, id ?? null],
        );
        if (duplicate.rows.length)
          throw new WorkspaceError(409, 'Esta URL já pertence a outro artigo.');
      }
      if (before)
        await client.query(
          'INSERT INTO workspace_document_versions(document_id,version,data,actor_id) VALUES($1,$2,$3,$4)',
          [before.id, before.version, JSON.stringify(before.data), actor.id],
        );
      const publishing = kind === 'blog' && (data as BlogData).status === 'published';
      const sync =
        kind === 'blog'
          ? (data as BlogData).status === 'draft' && !before?.publishedAt
            ? 'draft'
            : process.env.BLOG_SITE_WEBHOOK_URL
              ? 'pending'
              : 'not_configured'
          : 'not_applicable';
      const result = before
        ? await client.query(
            `UPDATE workspace_documents d SET data=$7::jsonb,lead_id=$8,version=d.version+1,updated_at=now(),archived_at=CASE WHEN $9::boolean IS NULL THEN d.archived_at WHEN $9 THEN now() ELSE NULL END,published_at=CASE WHEN $10 THEN COALESCE(d.published_at,$12::timestamptz,now()) ELSE d.published_at END,sync_status=$11 WHERE d.id=$5 AND d.kind=$6 AND ${scope} RETURNING ${columns}`,
            [
              ...values(actor),
              id,
              kind,
              JSON.stringify(data),
              leadId,
              archive ?? null,
              publishing,
              sync,
              before.publishedAt,
            ],
          )
        : await client.query(
            `INSERT INTO workspace_documents AS d(kind,owner_id,lead_id,data,published_at,sync_status) VALUES($1,$2,$3,$4,CASE WHEN $5 THEN now() ELSE NULL END,$6) RETURNING ${columns}`,
            [kind, actor.id, leadId, JSON.stringify(data), publishing, sync],
          );
      const item = map(result.rows[0]);
      const action = `${kind}.${archive === true ? 'archive' : archive === false ? 'restore' : before ? 'update' : 'create'}`;
      await client.query(
        `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,$2,$3,$4,$5)`,
        [
          actor.id,
          action,
          kind,
          item.id,
          JSON.stringify({ before: before?.data ?? null, after: data, archived: archive }),
        ],
      );
      if (kind === 'blog' && ((data as BlogData).status !== 'draft' || before?.publishedAt)) {
        const post = data as BlogData;
        const slugs = [
          ...new Set([post.slug, ...(before ? [(before.data as BlogData).slug] : [])]),
        ];
        await client.query(
          `INSERT INTO workspace_blog_outbox(document_id,slugs,next_attempt_at) VALUES($1,$2,CASE WHEN $3::text<>'' AND $4='scheduled' AND $5::boolean IS NOT TRUE THEN $3::timestamptz ELSE now() END)`,
          [item.id, JSON.stringify(slugs), post.scheduledAt, post.status, archive ?? false],
        );
      }
      await client.query('COMMIT');
      return item;
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505')
        throw new WorkspaceError(
          409,
          kind === 'blog'
            ? 'Esta URL já pertence a outro artigo.'
            : 'Já existe uma métrica desta campanha nesta data.',
        );
      throw error;
    } finally {
      client.release();
    }
  }
  async versions(id: string, kind: ModuleKind, actor: WorkspaceActor) {
    if (typedModules[kind]) return new TypedModuleStore(this.pool).versions(id, kind, actor);
    await this.get(id, kind, actor);
    return (
      await this.pool.query(
        'SELECT version,data,saved_at AS "savedAt" FROM workspace_document_versions WHERE document_id=$1 ORDER BY version DESC LIMIT 30',
        [id],
      )
    ).rows;
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
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const data of items) {
        const old = (
          await client.query(
            "SELECT d.id,d.data,d.version,d.owner_id,u.team_id FROM workspace_documents d JOIN users u ON u.id=d.owner_id WHERE d.kind='campaign' AND d.archived_at IS NULL AND d.data->>'campaignId'=$1 AND d.data->>'account'=$2 AND d.data->>'date'=$3 FOR UPDATE OF d",
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
            'Sem permissão para atualizar uma das campanhas. A importação foi cancelada.',
          );
        if (old)
          await client.query(
            'INSERT INTO workspace_document_versions(document_id,version,data,actor_id) VALUES($1,$2,$3,$4)',
            [old.id, old.version, JSON.stringify(old.data), actor.id],
          );
        const row = old
          ? await client.query(
              'UPDATE workspace_documents SET data=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING id',
              [old.id, JSON.stringify(data)],
            )
          : await client.query(
              "INSERT INTO workspace_documents(kind,owner_id,data,sync_status) VALUES('campaign',$1,$2,'not_applicable') RETURNING id",
              [actor.id, JSON.stringify(data)],
            );
        await client.query(
          "INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES($1,$2,'campaign.import','campaign',$3,$4)",
          [
            source,
            actor.id,
            row.rows[0].id,
            JSON.stringify({ before: old?.data ?? null, after: data }),
          ],
        );
      }
      await client.query('COMMIT');
      return { imported: items.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
