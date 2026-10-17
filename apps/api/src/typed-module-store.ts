import type { DatabaseConnectionResult } from '@dcfoundry/db';
import {
  moduleSchemas,
  type ModuleKind,
  type ModuleData,
  type WorkspaceDocument,
} from '@dcfoundry/shared';
import type { WorkspaceActor } from './workspace-store.js';
import { WorkspaceError } from './module-store.js';
// Only this code-owned registry supplies SQL identifiers. Values remain parameterized.
export const typedModules: Partial<
  Record<ModuleKind, { table: string; fields: Record<string, string> }>
> = {
  knowledge: {
    table: 'foundry_knowledge',
    fields: { title: 'title', content: 'content', category: 'category', audience: 'audience' },
  },
  assistant: {
    table: 'foundry_guidance',
    fields: { title: 'title', instructions: 'instructions', tone: 'tone' },
  },
};
const access = `($1::boolean OR owner_id=$2::uuid OR ($3::boolean AND owner_id IN(SELECT id FROM users WHERE team_id=$4::uuid)))`;
const values = (a: WorkspaceActor) => [a.scope === 'all', a.id, a.scope === 'team', a.teamId];
export class TypedModuleStore {
  constructor(public pool: DatabaseConnectionResult['pool']) {}
  private config(kind: ModuleKind) {
    const config = typedModules[kind];
    if (!config) throw new Error('Typed module unavailable');
    return config;
  }
  private map(kind: ModuleKind, row: Record<string, any>): WorkspaceDocument {
    const config = this.config(kind),
      data: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(config.fields)) data[key] = row[column];
    return {
      id: row.id,
      kind,
      ownerId: row.owner_id,
      leadId: row.lead_id ?? null,
      data: data as ModuleData,
      version: row.version,
      archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      publishedAt: null,
      syncStatus: 'not_applicable',
    };
  }
  async list(
    kind: ModuleKind,
    a: WorkspaceActor,
    archived = false,
    q = '',
    offset = 0,
    limit = 100,
  ) {
    const { table } = this.config(kind),
      where = `${access} AND (archived_at IS NOT NULL)=$5 AND ($6='' OR title ILIKE '%'||$6||'%')`,
      args = [...values(a), archived, q];
    return {
      items: (
        await this.pool.query(
          `SELECT * FROM ${table} WHERE ${where} ORDER BY updated_at DESC,id LIMIT $8 OFFSET $7`,
          [...args, offset, limit],
        )
      ).rows.map((row) => this.map(kind, row)),
      total: Number(
        (await this.pool.query(`SELECT count(*) AS n FROM ${table} WHERE ${where}`, args)).rows[0]
          .n,
      ),
    };
  }
  async get(id: string, kind: ModuleKind, a: WorkspaceActor) {
    const row = (
      await this.pool.query(`SELECT * FROM ${this.config(kind).table} WHERE ${access} AND id=$5`, [
        ...values(a),
        id,
      ])
    ).rows[0];
    if (!row) throw new WorkspaceError(404, 'Registro não encontrado ou sem permissão.');
    return this.map(kind, row);
  }
  async save(
    kind: ModuleKind,
    a: WorkspaceActor,
    data: ModuleData,
    _leadId: string | null,
    id?: string,
    version?: number,
    archive?: boolean,
  ) {
    data = moduleSchemas[kind].parse(data);
    const { table, fields } = this.config(kind),
      columns = Object.values(fields),
      entries = Object.keys(fields).map((key) => (data as unknown as Record<string, unknown>)[key]);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      let before;
      if (id) {
        before = (
          await client.query(`SELECT * FROM ${table} WHERE ${access} AND id=$5 FOR UPDATE`, [
            ...values(a),
            id,
          ])
        ).rows[0];
        if (!before) throw new WorkspaceError(404, 'Registro indisponível.');
        if (before.version !== version)
          throw new WorkspaceError(409, 'Este registro foi alterado. Atualize antes de salvar.');
        await client.query(
          `INSERT INTO ${table}_versions(document_id,version,${columns.join(',')},actor_id) SELECT id,version,${columns.join(',')},$2 FROM ${table} WHERE id=$1`,
          [id, a.id],
        );
      }
      const row = before
        ? (
            await client.query(
              `UPDATE ${table} SET ${columns.map((col, index) => `${col}=$${index + 2}`).join(',')},version=version+1,updated_at=now(),archived_at=CASE WHEN $${columns.length + 2}::boolean IS NULL THEN archived_at WHEN $${columns.length + 2} THEN now() ELSE NULL END WHERE id=$1 RETURNING *`,
              [id, ...entries, archive ?? null],
            )
          ).rows[0]
        : (
            await client.query(
              `INSERT INTO ${table}(owner_id,${columns.join(',')}) VALUES($1,${columns.map((_, i) => '$' + (i + 2)).join(',')}) RETURNING *`,
              [a.id, ...entries],
            )
          ).rows[0];
      await client.query(
        `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,$2,$3,$4,$5)`,
        [
          a.id,
          `${kind}.${before ? 'update' : 'create'}`,
          kind,
          row.id,
          JSON.stringify({ before: before ? this.map(kind, before).data : null, after: data }),
        ],
      );
      await client.query('COMMIT');
      return this.map(kind, row);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  async versions(id: string, kind: ModuleKind, a: WorkspaceActor) {
    await this.get(id, kind, a);
    const config = this.config(kind);
    return (
      await this.pool.query(
        `SELECT * FROM ${config.table}_versions WHERE document_id=$1 ORDER BY version DESC LIMIT 30`,
        [id],
      )
    ).rows.map((row) => ({
      version: row.version,
      savedAt: new Date(row.saved_at).toISOString(),
      data: Object.fromEntries(
        Object.entries(config.fields).map(([key, column]) => [key, row[column]]),
      ),
    }));
  }
}
