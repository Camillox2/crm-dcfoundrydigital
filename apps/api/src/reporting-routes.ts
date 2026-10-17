import type { FastifyInstance } from 'fastify';
import type { DatabaseConnectionResult } from '@dcfoundry/db';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  buildOperationsReport,
  resolveGrantedScope,
  CreateWorkspaceLeadSchema,
  normalizePhoneE164,
  type ReportAccess,
  type PermissionKey,
  type ReportDocument,
  type ReportLead,
  type SiteEvent,
  type AuthUserPayload,
} from '@dcfoundry/shared';
import { requireSession, requirePermission } from './plugins/auth.js';
import { WorkspaceError } from './module-store.js';

const permissions: Record<keyof ReportAccess, PermissionKey> = {
  lead: 'lead:read',
  task: 'task:read',
  project: 'task:read',
  invoice: 'finance:read',
  contract: 'contract:read',
  blog: 'blog:read',
  campaign: 'marketing_ads:read',
  site: 'marketing_ads:read',
};
const CAP = 10000;
export function reportScope(user: AuthUserPayload, permission: PermissionKey) {
  const grant = resolveGrantedScope(user.roles, permission);
  return {
    grant,
    args: [grant === 'all', user.id, grant === 'team', user.teamId ?? null],
  };
}
// The alias is fixed by each caller, never read from input.
const scope = (alias: string) =>
  `($1::boolean OR ${alias}.owner_id=$2::uuid OR ($3::boolean AND ${alias}.owner_id IN (SELECT id FROM users WHERE team_id=$4::uuid)))`;

export async function registerReportingRoutes(
  app: FastifyInstance,
  database: () => Promise<DatabaseConnectionResult> | null,
) {
  app.get(
    '/api/v1/workspace/site-health',
    { preHandler: [requirePermission('marketing_ads:read')] },
    async () => {
      const site = new URL(process.env.CRM_SITE_URL ?? 'https://dcfoundrydigital.com');
      if (
        site.protocol !== 'https:' ||
        site.username ||
        site.password ||
        ['localhost', '127.0.0.1', '::1'].includes(site.hostname)
      )
        throw new WorkspaceError(400, 'Configure um domínio público HTTPS para o site.');
      const checks = await Promise.all(
        ['/', '/blog', '/sitemap.xml', '/robots.txt', '/llms.txt'].map(async (path) => {
          const start = Date.now();
          try {
            const response = await fetch(new URL(path, site.origin), {
              method: 'HEAD',
              signal: AbortSignal.timeout(6000),
              redirect: 'error',
            });
            return {
              path,
              status: response.status,
              ok: response.ok,
              durationMs: Date.now() - start,
            };
          } catch {
            return {
              path,
              status: null,
              ok: false,
              durationMs: Date.now() - start,
            };
          }
        }),
      );
      return { checkedAt: new Date().toISOString(), site: site.origin, checks };
    },
  );
  app.get('/api/v1/workspace/report', { preHandler: [requireSession] }, async (req) => {
    const { days } = z
      .object({
        days: z.coerce
          .number()
          .refine((v) => [7, 30, 90].includes(v))
          .default(30),
      })
      .parse(req.query);
    const db = await database();
    if (!db) throw new WorkspaceError(503, 'Configure o banco para consultar os indicadores.');
    const user = req.authUser!;
    const access = Object.fromEntries(
      Object.entries(permissions).map(([key, permission]) => [
        key,
        Boolean(resolveGrantedScope(user.roles, permission)),
      ]),
    ) as ReportAccess;
    if (!Object.values(access).some(Boolean))
      throw new WorkspaceError(403, 'Seu perfil não tem dados disponíveis para relatórios.');
    let truncated = false;
    const readDocuments = async (kind: keyof ReportAccess) => {
      if (kind === 'lead' || kind === 'site' || !access[kind]) return [];
      const { args } = reportScope(user, permissions[kind]);
      const result = await db.pool.query(
        `SELECT d.id,d.kind,(d.data-'content'-'messages'-'instructions'-'scope'-'notes'-'terms') || jsonb_build_object('contentLength',length(COALESCE(d.data->>'content',''))) AS data,d.created_at AS "createdAt",d.updated_at AS "updatedAt",d.published_at AS "publishedAt",d.sync_status AS "syncStatus" FROM workspace_documents d WHERE ${scope('d')} AND d.kind=$5 AND d.archived_at IS NULL ORDER BY d.created_at DESC,d.id LIMIT ${CAP + 1}`,
        [...args, kind],
      );
      if (result.rows.length > CAP) truncated = true;
      return result.rows.slice(0, CAP).map((row) => ({
        ...row,
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
        publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
      })) as ReportDocument[];
    };
    const [leads, documents, events] = await Promise.all([
      (async () => {
        if (!access.lead) return [];
        const { args } = reportScope(user, 'lead:read');
        const result = await db.pool.query(
          `SELECT l.id,l.name,l.company,l.stage,l.monthly_value AS "monthlyValue",l.campaign,l.gclid,l.high_priority AS "highPriority",l.created_at AS "createdAt",l.updated_at AS "updatedAt" FROM workspace_leads l WHERE ${scope('l')} AND l.archived_at IS NULL ORDER BY l.created_at DESC,l.id LIMIT ${CAP + 1}`,
          args,
        );
        if (result.rows.length > CAP) truncated = true;
        return result.rows.slice(0, CAP).map((row) => ({
          ...row,
          monthlyValue: Number(row.monthlyValue),
          createdAt: new Date(row.createdAt).toISOString(),
          updatedAt: new Date(row.updatedAt).toISOString(),
        })) as ReportLead[];
      })(),
      Promise.all(
        Object.keys(permissions).map((kind) => readDocuments(kind as keyof ReportAccess)),
      ).then((groups) => groups.flat()),
      (async () => {
        if (!access.site) return [];
        const { args } = reportScope(user, 'marketing_ads:read');
        const result = await db.pool.query(
          `SELECT e.event,e.path,e.source,e.medium,e.campaign,e.occurred_at AS "occurredAt" FROM workspace_site_events e WHERE ${scope('e')} AND e.occurred_at >= ((current_timestamp AT TIME ZONE 'America/Sao_Paulo')::date - ($5::integer-1))::timestamp AT TIME ZONE 'America/Sao_Paulo' ORDER BY e.occurred_at DESC,e.id LIMIT ${CAP + 1}`,
          [...args, days],
        );
        if (result.rows.length > CAP) truncated = true;
        return result.rows.slice(0, CAP).map((row) => ({
          ...row,
          occurredAt: new Date(row.occurredAt).toISOString(),
        })) as SiteEvent[];
      })(),
    ]);
    return buildOperationsReport({
      leads,
      documents,
      events,
      access,
      days,
      truncated,
      siteConfigured: Boolean(
        process.env.CRM_SITE_INGEST_TOKEN &&
          process.env.CRM_SITE_INGEST_TOKEN.length >= 32 &&
          z.string().uuid().safeParse(process.env.CRM_SITE_OWNER_ID).success,
      ),
    });
  });

  const safeTag = z
    .string()
    .trim()
    .max(150)
    .regex(/^[\p{L}\p{N} _./:+-]*$/u)
    .default('');
  const eventInput = z.object({
    id: z.string().uuid(),
    event: z.string().regex(/^[a-z][a-z0-9_]{1,79}$/),
    path: z
      .string()
      .max(300)
      .regex(/^\/(?:[\p{L}\p{N}_./%-]*)$/u)
      .refine((v) => !v.includes('..') && !v.startsWith('//')),
    source: safeTag.transform((v) => v.slice(0, 100)),
    medium: safeTag.transform((v) => v.slice(0, 100)),
    campaign: safeTag,
    occurredAt: z
      .string()
      .datetime()
      .refine(
        (v) => Date.parse(v) <= Date.now() + 300000 && Date.parse(v) >= Date.now() - 90 * 86400000,
      ),
  });
  app.post('/api/v1/integrations/site/events', async (req, reply) => {
    const expected = process.env.CRM_SITE_INGEST_TOKEN;
    const owner = z.string().uuid().safeParse(process.env.CRM_SITE_OWNER_ID);
    if (!expected || expected.length < 32 || !owner.success)
      return reply.status(503).send({ error: 'SITE_INGEST_NOT_CONFIGURED' });
    const provided = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (
      Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    )
      return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { items } = z.object({ items: z.array(eventInput).min(1).max(100) }).parse(req.body);
    const db = await database();
    if (!db) throw new WorkspaceError(503, 'Banco indisponível.');
    const user = await db.pool.query('SELECT id FROM users WHERE id=$1 AND is_active=true', [
      owner.data,
    ]);
    if (!user.rows.length)
      throw new WorkspaceError(503, 'Responsável pela integração indisponível.');
    const client = await db.pool.connect();
    let accepted = 0;
    try {
      await client.query('BEGIN');
      for (const item of items) {
        const r = await client.query(
          'INSERT INTO workspace_site_events(id,owner_id,event,path,source,medium,campaign,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING RETURNING id',
          [
            item.id,
            owner.data,
            item.event,
            item.path,
            item.source,
            item.medium,
            item.campaign,
            item.occurredAt,
          ],
        );
        accepted += r.rows.length;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return { accepted, duplicates: items.length - accepted };
  });
  app.post('/api/v1/integrations/site/leads', async (req, reply) => {
    const expected = process.env.CRM_SITE_INGEST_TOKEN;
    const owner = z.string().uuid().safeParse(process.env.CRM_SITE_OWNER_ID);
    if (!expected || expected.length < 32 || !owner.success)
      return reply.status(503).send({ error: 'SITE_INGEST_NOT_CONFIGURED' });
    const provided = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (
      Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    )
      return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const input = z
      .object({ id: z.string().uuid(), lead: CreateWorkspaceLeadSchema })
      .parse(req.body);
    const db = await database();
    if (!db) throw new WorkspaceError(503, 'Banco indisponível.');
    const validOwner = await db.pool.query('SELECT id FROM users WHERE id=$1 AND is_active=true', [
      owner.data,
    ]);
    if (!validOwner.rows.length)
      throw new WorkspaceError(503, 'Responsável pela integração indisponível.');
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        'INSERT INTO workspace_site_intakes(id,owner_id) VALUES($1,$2) ON CONFLICT(id) DO NOTHING RETURNING id',
        [input.id, owner.data],
      );
      if (!inserted.rows.length) {
        const existing = await client.query(
          'SELECT lead_id FROM workspace_site_intakes WHERE id=$1 AND owner_id=$2',
          [input.id, owner.data],
        );
        if (!existing.rows[0])
          throw new WorkspaceError(409, 'Identificador de envio indisponível.');
        await client.query('COMMIT');
        return { id: existing.rows[0].lead_id, duplicate: true };
      }
      const d = input.lead;
      const created = await client.query(
        'INSERT INTO workspace_leads(owner_id,name,company,phone,scope_summary,modality,monthly_value,notes,high_priority,campaign,gclid) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
        [
          owner.data,
          d.name,
          d.company,
          normalizePhoneE164(d.phone),
          d.scopeSummary,
          d.modality,
          d.monthlyValue,
          d.notes,
          d.highPriority,
          d.campaign ?? '',
          d.gclid ?? '',
        ],
      );
      const id = created.rows[0].id;
      await client.query('UPDATE workspace_site_intakes SET lead_id=$2 WHERE id=$1', [
        input.id,
        id,
      ]);
      await client.query(
        "INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('system',$1,'site.lead_received','lead',$2,$3)",
        [
          owner.data,
          id,
          JSON.stringify({
            source: 'site_integration',
            submissionId: input.id,
          }),
        ],
      );
      await client.query('COMMIT');
      return reply.status(201).send({ id, duplicate: false });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
}
