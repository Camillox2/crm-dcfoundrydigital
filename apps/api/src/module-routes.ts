import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseConnectionResult } from '@dcfoundry/db';
import {
  moduleSchemas,
  ModuleKindSchema,
  moduleResources,
  resolveGrantedScope,
  type ModuleKind,
  type PermissionKey,
} from '@dcfoundry/shared';
import { z } from 'zod';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { requirePermission, requireSession } from './plugins/auth.js';
import { ModuleStore, WorkspaceError } from './module-store.js';
import { publicPost, publishedSql, flushBlogOutbox } from './blog-publishing.js';
import { askGemini } from './assistant-provider.js';
import { loadFoundryContext, type FoundryGenerate } from './foundry-engine.js';

type Database = () => Promise<DatabaseConnectionResult> | null;
const uuid = z.string().uuid();
const writeInput = z.object({
  data: z.unknown(),
  leadId: uuid.nullable().optional(),
  version: z.number().int().positive().optional(),
});
export async function registerModuleRoutes(
  app: FastifyInstance,
  database: Database,
  generate: FoundryGenerate = askGemini,
) {
  const repo = async () => {
    const db = await database();
    if (!db)
      throw new WorkspaceError(
        503,
        'Configure o banco e o administrador no VPS para gravar os dados.',
      );
    return new ModuleStore(db.pool);
  };
  const auth = (kind: ModuleKind, action: 'read' | 'create' | 'update') =>
    requirePermission(`${moduleResources[kind]}:${action}` as PermissionKey);
  const actor = (
    req: { authUser?: import('@dcfoundry/shared').AuthUserPayload },
    kind: ModuleKind,
    action: 'read' | 'create' | 'update',
  ) => ({
    id: req.authUser!.id,
    teamId: req.authUser!.teamId ?? null,
    scope: resolveGrantedScope(
      req.authUser!.roles,
      `${moduleResources[kind]}:${action}` as PermissionKey,
    )!,
  });
  const save = async (req: FastifyRequest, kind: ModuleKind, id?: string) => {
    const raw = writeInput.parse(req.body);
    const data = moduleSchemas[kind].parse(raw.data);
    if (
      kind === 'contract' &&
      ['accepted', 'active'].includes((data as { status: string }).status) &&
      !resolveGrantedScope(req.authUser!.roles, 'contract:approve')
    )
      throw new WorkspaceError(403, 'Seu perfil não pode registrar o aceite deste contrato.');
    return {
      item: await (
        await repo()
      ).save(
        kind,
        actor(req, kind, id ? 'update' : 'create'),
        data,
        raw.leadId ?? null,
        id,
        raw.version,
      ),
    };
  };
  for (const kind of ModuleKindSchema.options) {
    app.get(`/api/v1/workspace/${kind}`, { preHandler: [auth(kind, 'read')] }, async (req) => {
      const q = z
        .object({
          archived: z.enum(['0', '1']).optional(),
          q: z.string().max(180).default(''),
          offset: z.coerce.number().int().min(0).max(50000).default(0),
        })
        .parse(req.query);
      return (await repo()).list(kind, actor(req, kind, 'read'), q.archived === '1', q.q, q.offset);
    });
    app.post(
      `/api/v1/workspace/${kind}`,
      { preHandler: [auth(kind, 'create')] },
      async (req, reply) => reply.status(201).send(await save(req, kind)),
    );
    app.put(`/api/v1/workspace/${kind}/:id`, { preHandler: [auth(kind, 'update')] }, async (req) =>
      save(req, kind, uuid.parse((req.params as { id: string }).id)),
    );
    app.patch(
      `/api/v1/workspace/${kind}/:id/archive`,
      { preHandler: [auth(kind, 'update')] },
      async (req) => {
        const id = uuid.parse((req.params as { id: string }).id);
        const input = z
          .object({ version: z.number().int().positive(), archived: z.boolean() })
          .parse(req.body);
        const store = await repo();
        const a = actor(req, kind, 'update');
        const existing = await store.get(id, kind, a);
        return {
          item: await store.save(
            kind,
            a,
            existing.data,
            existing.leadId,
            id,
            input.version,
            input.archived,
          ),
        };
      },
    );
    app.get(
      `/api/v1/workspace/${kind}/:id/versions`,
      { preHandler: [auth(kind, 'read')] },
      async (req) => ({
        items: await (
          await repo()
        ).versions(uuid.parse((req.params as { id: string }).id), kind, actor(req, kind, 'read')),
      }),
    );
  }
  app.get(
    '/api/v1/workspace/audit',
    { preHandler: [requirePermission('audit_log:read')] },
    async (req) => {
      const q = z
        .object({
          q: z.string().max(180).default(''),
          offset: z.coerce.number().int().min(0).max(50000).default(0),
        })
        .parse(req.query);
      return {
        items: await (
          await repo()
        ).audit(
          {
            id: req.authUser!.id,
            teamId: req.authUser!.teamId ?? null,
            scope: resolveGrantedScope(req.authUser!.roles, 'audit_log:read')!,
          },
          q.q,
          q.offset,
        ),
      };
    },
  );
  app.get('/api/v1/workspace/integrations', { preHandler: [requireSession] }, async () => ({
    database: Boolean(process.env.DATABASE_URL),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    blogSync: Boolean(process.env.BLOG_SITE_WEBHOOK_URL && process.env.BLOG_REVALIDATE_SECRET),
    adsIngest: Boolean(process.env.CRM_ADS_INGEST_TOKEN),
    siteEvents: Boolean(
      process.env.CRM_SITE_INGEST_TOKEN &&
      process.env.CRM_SITE_INGEST_TOKEN.length >= 32 &&
      uuid.safeParse(process.env.CRM_SITE_OWNER_ID).success,
    ),
    siteUrl: process.env.CRM_SITE_URL ?? 'https://dcfoundrydigital.com',
    whatsapp: 'manual',
  }));
  app.get('/api/v1/workspace/daily-summary', { preHandler: [requireSession] }, async (req) => {
    const store = await repo();
    const result: Record<string, number> = {};
    for (const kind of ['task', 'project', 'invoice', 'contract', 'blog', 'campaign'] as const) {
      const granted = resolveGrantedScope(
        req.authUser!.roles,
        `${moduleResources[kind]}:read` as PermissionKey,
      );
      if (!granted) continue;
      const row = await store.pool.query(
        `SELECT count(*)::integer AS total,count(*) FILTER(WHERE data->>'status' IN ('open','draft','sent','scheduled') AND (data->>'status'<>'scheduled' OR NULLIF(data->>'scheduledAt','')::timestamptz>now()))::integer AS pending,count(*) FILTER(WHERE data->>'status'='open' AND data->>'dueDate'<to_char(current_timestamp AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD'))::integer AS overdue FROM workspace_documents WHERE kind=$1 AND archived_at IS NULL AND ($2::boolean OR owner_id=$3::uuid OR ($4::boolean AND owner_id IN(SELECT id FROM users WHERE team_id=$5::uuid)))`,
        [
          kind,
          granted === 'all',
          req.authUser!.id,
          granted === 'team',
          req.authUser!.teamId ?? null,
        ],
      );
      result[kind] = Number(row.rows[0].total);
      result[kind + 'Pending'] = Number(row.rows[0].pending);
      result[kind + 'Overdue'] = Number(row.rows[0].overdue);
    }
    return result;
  });
  app.post(
    '/api/v1/workspace/blog-sync',
    { preHandler: [requirePermission('blog:update')] },
    async () => flushBlogOutbox((await repo()).pool),
  );
  app.post(
    '/api/v1/workspace/campaign-import',
    { preHandler: [requirePermission('marketing_ads:create')] },
    async (req) => {
      const input = z
        .object({ items: z.array(moduleSchemas.campaign).min(1).max(500) })
        .parse(req.body);
      const store = await repo();
      return store.importCampaigns(
        actor(req, 'campaign', 'create'),
        input.items,
        Boolean(resolveGrantedScope(req.authUser!.roles, 'marketing_ads:update')),
      );
    },
  );
  app.post(
    '/api/v1/workspace/assistant-chat',
    { preHandler: [requirePermission('ai_agent:read')] },
    async (req) => {
      const input = z.object({ message: z.string().trim().min(2).max(5000) }).parse(req.body);
      const store = await repo();
      const a = {
        id: req.authUser!.id,
        teamId: req.authUser!.teamId ?? null,
        scope: resolveGrantedScope(req.authUser!.roles, 'ai_agent:read')!,
      };
      const { context } = await loadFoundryContext(store.pool, 'internal');
      const result = await generate(input.message, context);
      await store.save(
        'conversation',
        { ...a, scope: 'own' },
        {
          title: input.message.slice(0, 100),
          messages: [
            { role: 'user', content: input.message },
            { role: 'assistant', content: result.answer },
          ],
        },
        null,
      );
      return result;
    },
  );
  app.post(
    '/api/v1/media',
    { bodyLimit: 3_000_000, preHandler: [requirePermission('blog:create')] },
    async (req, reply) => {
      const input = z.object({ image: z.string().max(2_900_000) }).parse(req.body);
      const match = input.image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) throw new WorkspaceError(400, 'Envie uma imagem PNG, JPG ou WebP.');
      const bytes = Buffer.from(match[2]!, 'base64');
      const valid =
        match[1] === 'png'
          ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : match[1] === 'jpeg'
            ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : bytes.subarray(0, 4).toString() === 'RIFF' &&
              bytes.subarray(8, 12).toString() === 'WEBP';
      if (!valid || bytes.length > 2_000_000)
        throw new WorkspaceError(400, 'Imagem inválida ou maior que 2 MB.');
      const name = `${randomUUID()}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
      const dir = resolve(process.env.CRM_UPLOAD_DIR ?? '.runtime/uploads');
      await mkdir(dir, { recursive: true });
      await writeFile(resolve(dir, name), bytes, { flag: 'wx', mode: 0o600 });
      return reply.status(201).send({ url: `/api/v1/media/${name}` });
    },
  );
  app.get('/api/v1/media/:name', async (req, reply) => {
    const name = z
      .string()
      .regex(/^[a-f0-9-]+\.(png|jpg|webp)$/)
      .parse((req.params as { name: string }).name);
    try {
      const bytes = await readFile(resolve(process.env.CRM_UPLOAD_DIR ?? '.runtime/uploads', name));
      return reply
        .header('Cache-Control', 'public,max-age=31536000,immutable')
        .type(
          name.endsWith('.png') ? 'image/png' : name.endsWith('.jpg') ? 'image/jpeg' : 'image/webp',
        )
        .send(bytes);
    } catch {
      return reply.status(404).send({ error: 'Imagem não encontrada.' });
    }
  });
  const publicList = async (req: FastifyRequest) => {
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(12),
        offset: z.coerce.number().int().min(0).max(50000).default(0),
        search: z.string().max(180).default(''),
        tag: z.string().max(40).default(''),
      })
      .parse(req.query);
    const pool = (await repo()).pool;
    const where = `${publishedSql} AND ($1='' OR data->>'title' ILIKE '%'||$1||'%') AND ($2='' OR data->'tags' ? $2)`;
    const [rows, count] = await Promise.all([
      pool.query(
        `SELECT * FROM workspace_documents WHERE ${where} ORDER BY COALESCE(published_at,NULLIF(data->>'scheduledAt','')::timestamptz) DESC,id LIMIT $3 OFFSET $4`,
        [q.search, q.tag, q.limit, q.offset],
      ),
      pool.query(`SELECT count(*) AS total FROM workspace_documents WHERE ${where}`, [
        q.search,
        q.tag,
      ]),
    ]);
    return { items: rows.rows.map(publicPost), total: Number(count.rows[0].total) };
  };
  app.get('/api/blog/posts', publicList);
  app.get('/api/blog/posts/featured', publicList);
  app.get('/api/blog/tags', async () => ({
    tags: (
      await (
        await repo()
      ).pool.query(
        `SELECT DISTINCT jsonb_array_elements_text(data->'tags') AS tag FROM workspace_documents WHERE ${publishedSql} LIMIT 100`,
      )
    ).rows.map((r) => r.tag),
  }));
  app.get('/api/blog/posts/:slug', async (req, reply) => {
    const slug = z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(180)
      .parse((req.params as { slug: string }).slug);
    const rows = await (
      await repo()
    ).pool.query(`SELECT * FROM workspace_documents WHERE ${publishedSql} AND data->>'slug'=$1`, [
      slug,
    ]);
    return rows.rows[0]
      ? publicPost(rows.rows[0])
      : reply.status(404).send({ error: 'Artigo não encontrado.' });
  });
  app.post('/api/v1/integrations/ads/metrics', async (req, reply) => {
    const expected = process.env.CRM_ADS_INGEST_TOKEN;
    const supplied = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (
      !expected ||
      expected.length < 32 ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    )
      return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const body = z
      .object({ ownerId: uuid, items: z.array(moduleSchemas.campaign).min(1).max(500) })
      .parse(req.body);
    const store = await repo();
    const owner = await store.pool.query('SELECT id FROM users WHERE id=$1 AND is_active=true', [
      body.ownerId,
    ]);
    if (!owner.rows.length) throw new WorkspaceError(400, 'Responsável inválido.');
    return store.importCampaigns(
      { id: body.ownerId, teamId: null, scope: 'all' },
      body.items,
      true,
      'webhook',
    );
  });
  let timer: ReturnType<typeof setInterval> | undefined;
  if (process.env.BLOG_SITE_WEBHOOK_URL)
    app.addHook('onReady', async () => {
      let running = false;
      timer = setInterval(async () => {
        if (running) return;
        running = true;
        try {
          const db = await database();
          if (db) await flushBlogOutbox(db.pool);
        } catch {
        } finally {
          running = false;
        }
      }, 30000);
      timer.unref();
    });
  app.addHook('onClose', async () => {
    if (timer) clearInterval(timer);
  });
}
