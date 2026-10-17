import type { DatabaseConnectionResult } from '@dcfoundry/db';
import {
  moduleSchemas,
  type ModuleKind,
  type ModuleData,
  type WorkspaceDocument,
} from '@dcfoundry/shared';
import type { WorkspaceActor } from './workspace-store.js';
import { WorkspaceError } from './module-store.js';
import { seal, unseal } from './private-fields.js';
import { remainingTypedModules } from './record-tables.js';
// Only this code-owned registry supplies SQL identifiers. Values remain parameterized.
export const typedModules: Partial<
  Record<
    ModuleKind,
    {
      table: string;
      fields: Record<string, string>;
      leadLink?: boolean;
      numbers?: string[];
      dates?: string[];
      secrets?: string[];
      timestamps?: string[];
    }
  >
> = {
  ...remainingTypedModules,
  knowledge: {
    table: 'foundry_knowledge',
    fields: { title: 'title', content: 'content', category: 'category', audience: 'audience' },
  },
  assistant: {
    table: 'foundry_guidance',
    fields: { title: 'title', instructions: 'instructions', tone: 'tone' },
  },
  contract: {
    table: 'agency_proposals',
    leadLink: true,
    numbers: ['valueCents', 'upfrontCents', 'installments', 'paymentDay'],
    dates: ['validUntil'],
    secrets: ['clientDocument'],
    fields: {
      title: 'title',
      client: 'client',
      clientDocument: 'client_document_ciphertext',
      clientEmail: 'client_email',
      clientAddress: 'client_address',
      clientRepresentative: 'client_representative',
      serviceType: 'service_type',
      valueCents: 'value_cents',
      upfrontCents: 'upfront_cents',
      installments: 'installments',
      paymentDay: 'payment_day',
      billing: 'billing',
      status: 'status',
      scope: 'scope',
      terms: 'terms',
      validUntil: 'valid_until',
    },
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
  private data(kind: ModuleKind, row: Record<string, any>) {
    const config = this.config(kind),
      data: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(config.fields)) {
      const value = row[column];
      data[key] = config.secrets?.includes(key)
        ? unseal(String(value ?? ''))
        : config.numbers?.includes(key)
          ? Number(value)
          : config.timestamps?.includes(key)
            ? value
              ? new Date(value).toISOString()
              : ''
            : config.dates?.includes(key)
              ? value
                ? new Date(value).toISOString().slice(0, 10)
                : ''
              : value;
    }
    if (kind === 'conversation') data.messages = row.messages ?? [];
    return data as ModuleData;
  }
  private projection(kind: ModuleKind, versions = false) {
    if (kind !== 'conversation') return '*';
    const table = this.config(kind).table + (versions ? '_versions' : '');
    return (
      "*,COALESCE((SELECT jsonb_agg(jsonb_build_object('role',m.role,'content',m.content) ORDER BY m.position) FROM " +
      (versions ? 'agency_conversation_version_messages' : 'agency_conversation_messages') +
      ' m WHERE m.document_id=' +
      table +
      '.' +
      (versions ? 'document_id' : 'id') +
      (versions ? ' AND m.version=' + table + '.version' : '') +
      "),'[]'::jsonb) AS messages"
    );
  }
  private map(kind: ModuleKind, row: Record<string, any>): WorkspaceDocument {
    return {
      id: row.id,
      kind,
      ownerId: row.owner_id,
      leadId: row.lead_id ?? null,
      data: this.data(kind, row),
      version: row.version,
      archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      publishedAt: row.published_at
        ? new Date(row.published_at).toISOString()
        : kind === 'blog' &&
            row.status === 'scheduled' &&
            row.scheduled_at &&
            new Date(row.scheduled_at).getTime() <= Date.now()
          ? new Date(row.scheduled_at).toISOString()
          : null,
      syncStatus: row.sync_status ?? 'not_applicable',
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
          `SELECT ${this.projection(kind)} FROM ${table} WHERE ${where} ORDER BY updated_at DESC,id LIMIT $8 OFFSET $7`,
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
      await this.pool.query(
        `SELECT ${this.projection(kind)} FROM ${this.config(kind).table} WHERE ${access} AND id=$5`,
        [...values(a), id],
      )
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
    if (kind === 'blog' && archive !== undefined) {
      const original = data as { status: string };
      data = {
        ...moduleSchemas.blog.parse({ ...data, status: 'draft' }),
        status: original.status,
      } as ModuleData;
    } else data = moduleSchemas[kind].parse(data);
    const config = this.config(kind),
      { table, fields } = config,
      columns = [...Object.values(fields), ...(config.leadLink ? ['lead_id'] : [])],
      entries = [
        ...Object.keys(fields).map((key) => {
          const value = (data as unknown as Record<string, unknown>)[key];
          return config.secrets?.includes(key)
            ? seal(String(value ?? ''))
            : (config.dates?.includes(key) || config.timestamps?.includes(key)) && value === ''
              ? null
              : value;
        }),
        ...(config.leadLink ? [_leadId] : []),
      ];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (config.leadLink && _leadId) {
        const lead = (
          await client.query(`SELECT id FROM workspace_leads WHERE ${access} AND id=$5`, [
            ...values(a),
            _leadId,
          ])
        ).rows[0];
        if (!lead) throw new WorkspaceError(404, 'Contato vinculado indisponível.');
      }
      let before;
      if (id) {
        before = (
          await client.query(
            `SELECT ${this.projection(kind)} FROM ${table} WHERE ${access} AND id=$5 FOR UPDATE`,
            [...values(a), id],
          )
        ).rows[0];
        if (!before) throw new WorkspaceError(404, 'Registro indisponível.');
        if (before.version !== version)
          throw new WorkspaceError(409, 'Este registro foi alterado. Atualize antes de salvar.');
        if (
          kind === 'blog' &&
          this.map(kind, before).publishedAt &&
          before.slug !== (data as { slug: string }).slug
        )
          throw new WorkspaceError(409, 'A URL de um artigo já publicado deve ser preservada.');
        if (
          kind === 'contract' &&
          ['accepted', 'active'].includes(before.status) &&
          ['accepted', 'active'].includes((data as { status: string }).status)
        ) {
          const previous = this.data(kind, before) as unknown as Record<string, unknown>,
            next = data as unknown as Record<string, unknown>;
          if (
            before.lead_id !== _leadId ||
            Object.keys(fields).some(
              (key) =>
                key !== 'status' && JSON.stringify(previous[key]) !== JSON.stringify(next[key]),
            )
          )
            throw new WorkspaceError(
              409,
              'Crie uma revisão em rascunho antes de alterar uma proposta aceita.',
            );
        }
        await client.query(
          `INSERT INTO ${table}_versions(document_id,version,${columns.join(',')},actor_id) SELECT id,version,${columns.join(',')},$2 FROM ${table} WHERE id=$1`,
          [id, a.id],
        );
        if (kind === 'conversation')
          await client.query(
            'INSERT INTO agency_conversation_version_messages(document_id,version,position,role,content) SELECT document_id,$2,position,role,content FROM agency_conversation_messages WHERE document_id=$1',
            [id, before.version],
          );
      }
      if (kind === 'blog') {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          'blog:' + (data as { slug: string }).slug,
        ]);
        if (
          (
            await client.query(
              'SELECT id FROM agency_blog_posts WHERE slug=$1 AND ($2::uuid IS NULL OR id<>$2)',
              [(data as { slug: string }).slug, id ?? null],
            )
          ).rows.length
        )
          throw new WorkspaceError(409, 'Esta URL já pertence a outro artigo.');
      }
      let row = before
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
      if (kind === 'conversation') {
        await client.query('DELETE FROM agency_conversation_messages WHERE document_id=$1', [
          row.id,
        ]);
        const messages = (data as { messages: { role: string; content: string }[] }).messages;
        for (const [position, message] of messages.entries())
          await client.query(
            'INSERT INTO agency_conversation_messages(document_id,position,role,content) VALUES($1,$2,$3,$4)',
            [row.id, position, message.role, message.content],
          );
        row.messages = messages;
      }
      if (kind === 'blog') {
        const post = data as import('@dcfoundry/shared').BlogData,
          published = post.status === 'published',
          priorPublished = before ? this.map(kind, before).publishedAt : null;
        const sync =
          post.status === 'draft' && !priorPublished
            ? 'draft'
            : process.env.BLOG_SITE_WEBHOOK_URL
              ? 'pending'
              : 'not_configured';
        row = (
          await client.query(
            'UPDATE agency_blog_posts SET published_at=COALESCE($2::timestamptz,published_at,CASE WHEN $3 THEN now() ELSE NULL END),sync_status=$4 WHERE id=$1 RETURNING *',
            [row.id, priorPublished, published, sync],
          )
        ).rows[0];
        if (post.status !== 'draft' || priorPublished)
          await client.query(
            "INSERT INTO workspace_blog_outbox(document_id,slugs,next_attempt_at) VALUES($1,$2,CASE WHEN $3::text<>'' AND $4='scheduled' AND $5::boolean IS NOT TRUE THEN $3::timestamptz ELSE now() END)",
            [row.id, JSON.stringify([post.slug]), post.scheduledAt, post.status, archive ?? false],
          );
      }
      await client.query(
        `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,$2,$3,$4,$5)`,
        [
          a.id,
          `${kind}.${archive === true ? 'archive' : archive === false ? 'restore' : before ? 'update' : 'create'}`,
          kind,
          row.id,
          JSON.stringify({
            before: before
              ? {
                  ...this.map(kind, before).data,
                  ...Object.fromEntries((config.secrets ?? []).map((key) => [key, '[privado]'])),
                }
              : null,
            after: {
              ...data,
              ...Object.fromEntries((config.secrets ?? []).map((key) => [key, '[privado]'])),
            },
          }),
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
        `SELECT ${this.projection(kind, true)} FROM ${config.table}_versions WHERE document_id=$1 ORDER BY version DESC LIMIT 30`,
        [id],
      )
    ).rows.map((row) => ({
      version: row.version,
      savedAt: new Date(row.saved_at).toISOString(),
      data: this.data(kind, row),
    }));
  }
}
