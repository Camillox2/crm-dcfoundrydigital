import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseConnectionResult } from '@dcfoundry/db';
import { resolveGrantedScope } from '@dcfoundry/shared';
import { z } from 'zod';
import { requirePermission } from './plugins/auth.js';
import { requestActor, scopedLead } from './agency-access.js';
import { WorkspaceError } from './module-store.js';
import { sha256 } from './service-contracts.js';
import { WebsiteChat } from './website-chat.js';
import type { FoundryGenerate } from './foundry-engine.js';
import { applyFoundryControl } from './foundry-control.js';
import { humanResponseSla, type SlaMessage } from './human-sla.js';
export async function registerWebsiteChatRoutes(
  app: FastifyInstance,
  database: () => Promise<DatabaseConnectionResult> | null,
  generate?: FoundryGenerate,
  syncControl?: (id: string) => Promise<void>,
) {
  const pool = async () => {
    const db = await database();
    if (!db) throw new WorkspaceError(503, 'Configure o PostgreSQL.');
    return db.pool;
  };
  const bridge = async (req: FastifyRequest) => {
    const expected = process.env.CRM_SITE_INGEST_TOKEN ?? '',
      provided = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (expected.length < 32) throw new WorkspaceError(503, 'Configure a integração do site.');
    if (
      Buffer.byteLength(expected) !== Buffer.byteLength(provided) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
    )
      throw new WorkspaceError(401, 'Integração não autorizada.');
  };
  const session = async (token: string) => {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new WorkspaceError(404, 'Conversa indisponível.');
    const row = (
      await (
        await pool()
      ).query(
        'SELECT s.* FROM website_chat_sessions s JOIN workspace_leads l ON l.id=s.lead_id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL AND l.archived_at IS NULL',
        [sha256(token)],
      )
    ).rows[0];
    if (!row) throw new WorkspaceError(404, 'Conversa expirada ou indisponível.');
    return row;
  };
  const publicConfig = {
    preHandler: [bridge],
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  };
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.includes('/website-chat')) reply.header('Cache-Control', 'no-store');
    return payload;
  });
  app.post('/api/public/website-chat/sessions', publicConfig, async (req, reply) => {
    const input = z
        .object({
          visitorHash: z.string().regex(/^[a-f0-9]{64}$/),
          path: z.string().startsWith('/').max(500).default('/'),
        })
        .parse(req.body),
      owner = z.string().uuid().safeParse(process.env.CRM_SITE_OWNER_ID);
    if (!owner.success) throw new WorkspaceError(503, 'Configure o responsável pelo site.');
    const p = await pool(),
      c = await p.connect(),
      token = randomBytes(32).toString('hex');
    try {
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['visitor:' + input.visitorHash]);
      if (
        !(await c.query('SELECT id FROM users WHERE id=$1 AND is_active=true', [owner.data])).rows
          .length
      )
        throw new WorkspaceError(503, 'Responsável indisponível.');
      if (
        Number(
          (
            await c.query(
              "SELECT count(*) AS n FROM website_chat_sessions WHERE visitor_hash=$1 AND created_at>now()-interval '1 day'",
              [input.visitorHash],
            )
          ).rows[0].n,
        ) >= 5
      )
        throw new WorkspaceError(429, 'Limite de conversas atingido. Tente mais tarde.');
      const lead = (
        await c.query(
          "INSERT INTO workspace_leads(owner_id,name,company,phone,scope_summary) VALUES($1,'Visitante do site','Contato pelo site','','Conversa iniciada em '||$2) RETURNING id",
          [owner.data, input.path],
        )
      ).rows[0];
      const row = (
        await c.query(
          "INSERT INTO website_chat_sessions(lead_id,owner_id,token_hash,visitor_hash,expires_at,path) VALUES($1,$2,$3,$4,now()+interval '14 days',$5) RETURNING id",
          [lead.id, owner.data, sha256(token), input.visitorHash, input.path],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO audit_logs(actor_type,action,entity_type,entity_id,diff_json) VALUES('system','website_chat.created','lead',$1,$2)",
        [lead.id, JSON.stringify({ sessionId: row.id })],
      );
      await c.query('COMMIT');
      return reply.code(201).send({ token });
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  });
  app.get('/api/public/website-chat/sessions/:token', publicConfig, async (req) => {
    const row = await session((req.params as any).token);
    return { messages: await new WebsiteChat(await pool(), generate).messages(row.id) };
  });
  app.delete('/api/public/website-chat/sessions/:token', publicConfig, async (req) => {
    const row = await session((req.params as any).token);
    await (
      await pool()
    ).query('UPDATE website_chat_sessions SET revoked_at=now() WHERE id=$1', [row.id]);
    return { revoked: true };
  });
  app.post('/api/public/website-chat/sessions/:token/messages', publicConfig, async (req) => {
    const row = await session((req.params as any).token),
      input = z
        .object({ id: z.string().uuid(), message: z.string().trim().min(1).max(4000) })
        .parse(req.body),
      p = await pool(),
      engine = new WebsiteChat(p, generate);
    if (
      Number(
        (
          await p.query(
            "SELECT count(*) AS n FROM website_chat_messages WHERE session_id=$1 AND role='contact' AND created_at>now()-interval '1 hour'",
            [row.id],
          )
        ).rows[0].n,
      ) >= 40
    )
      throw new WorkspaceError(429, 'Aguarde antes de enviar mais mensagens.');
    await engine.receive(row, input.id, input.message);
    return { messages: await engine.messages(row.id) };
  });
  app.get(
    '/api/v1/website-chat',
    { preHandler: [requirePermission('whatsapp:read')] },
    async (req) => {
      const a = requestActor(req, 'whatsapp:read'),
        l = requestActor(req, 'lead:read');
      return {
        items: (
          await (
            await pool()
          ).query(
            'SELECT s.id,s.lead_id,s.last_message_at,s.path,l.name,l.ai_paused FROM website_chat_sessions s JOIN workspace_leads l ON l.id=s.lead_id LEFT JOIN users u ON u.id=l.owner_id WHERE s.expires_at>now() AND s.revoked_at IS NULL AND l.archived_at IS NULL AND ($1::boolean OR l.owner_id=$2 OR ($3::boolean AND u.team_id=$4)) AND ($5::boolean OR l.owner_id=$2 OR ($6::boolean AND u.team_id=$7)) ORDER BY s.last_message_at DESC LIMIT 100',
            [
              a.scope === 'all',
              a.id,
              a.scope === 'team',
              a.teamId,
              l.scope === 'all',
              l.scope === 'team',
              l.teamId,
            ],
          )
        ).rows,
      };
    },
  );
  const staffSession = async (
    req: FastifyRequest,
    permission: 'whatsapp:read' | 'whatsapp:create',
  ) => {
    const id = z
        .string()
        .uuid()
        .parse((req.params as any).id),
      row = (await (await pool()).query('SELECT * FROM website_chat_sessions WHERE id=$1', [id]))
        .rows[0];
    if (!row) throw new WorkspaceError(404, 'Conversa indisponível.');
    await scopedLead(await pool(), req, row.lead_id);
    await scopedLead(await pool(), req, row.lead_id, permission);
    return row;
  };
  app.get(
    '/api/v1/website-chat/:id',
    { preHandler: [requirePermission('whatsapp:read')] },
    async (req) => {
      const row = await staffSession(req, 'whatsapp:read');
      return {
        messages: await new WebsiteChat(await pool()).messages(row.id),
        leadId: row.lead_id,
      };
    },
  );
  app.post(
    '/api/v1/website-chat/:id/messages',
    { preHandler: [requirePermission('whatsapp:create')] },
    async (req, reply) => {
      const row = await staffSession(req, 'whatsapp:create'),
        input = z
          .object({ id: z.string().uuid(), message: z.string().trim().min(1).max(4000) })
          .parse(req.body),
        c = await (await pool()).connect();
      try {
        await c.query('BEGIN');
        const current = (
          await c.query(
            'SELECT revoked_at,expires_at FROM website_chat_sessions WHERE id=$1 FOR UPDATE',
            [row.id],
          )
        ).rows[0];
        if (current.revoked_at || new Date(current.expires_at).getTime() <= Date.now())
          throw new WorkspaceError(409, 'Conversa encerrada.');
        const duplicate = (
          await c.query(
            'SELECT id FROM website_chat_messages WHERE session_id=$1 AND request_key=$2',
            [row.id, input.id],
          )
        ).rows[0];
        if (!duplicate) {
          await applyFoundryControl(c, row.lead_id, true, undefined, req.authUser!.id);
          await c.query(
            "INSERT INTO website_chat_messages(session_id,lead_id,role,actor_id,body,request_key) VALUES($1,$2,'human',$3,$4,$5)",
            [row.id, row.lead_id, req.authUser!.id, input.message, input.id],
          );
          await c.query('UPDATE website_chat_sessions SET last_message_at=now() WHERE id=$1', [
            row.id,
          ]);
        }
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
      await syncControl?.(row.lead_id);
      return reply.code(201).send({ sent: true });
    },
  );
  app.get(
    '/api/v1/reports/human-sla',
    { preHandler: [requirePermission('lead:read')] },
    async (req) => {
      const a = requestActor(req, 'lead:read'),
        w = resolveGrantedScope(req.authUser!.roles, 'whatsapp:read');
      if (!w) return { available: false, ...humanResponseSla([]) };
      const where =
        '($1::boolean OR l.owner_id=$2 OR ($3::boolean AND u.team_id=$4)) AND ($5::boolean OR l.owner_id=$2 OR ($6::boolean AND u.team_id=$4))';
      const p = await pool(),
        rows = (
          await p.query(
            "SELECT m.lead_id,'whatsapp' AS channel,m.direction,m.actor_type,m.sent_at,m.delivery,m.historical,COALESCE(s.sla_minutes,30) AS sla_minutes,l.name FROM wa_messages m JOIN workspace_leads l ON l.id=m.lead_id LEFT JOIN users u ON u.id=l.owner_id LEFT JOIN pipeline_stages s ON s.pipeline_id=l.pipeline_id AND s.slug=l.stage WHERE " +
              where +
              " AND m.sent_at>now()-interval '30 days' AND l.archived_at IS NULL UNION ALL SELECT m.lead_id,'website' AS channel,CASE WHEN m.role='contact' THEN 'inbound' ELSE 'outbound' END,m.role,m.created_at,'sent',false,COALESCE(s.sla_minutes,30),l.name FROM website_chat_messages m JOIN workspace_leads l ON l.id=m.lead_id LEFT JOIN users u ON u.id=l.owner_id LEFT JOIN pipeline_stages s ON s.pipeline_id=l.pipeline_id AND s.slug=l.stage WHERE " +
              where +
              " AND m.created_at>now()-interval '30 days' AND l.archived_at IS NULL ORDER BY sent_at DESC LIMIT 10000",
            [a.scope === 'all', a.id, a.scope === 'team', a.teamId, w === 'all', w === 'team'],
          )
        ).rows.map((r) => ({
          ...r,
          sent_at: new Date(r.sent_at).toISOString(),
          actor_type: r.actor_type === 'contact' ? 'contact' : r.actor_type,
        })) as SlaMessage[];
      return {
        available: true,
        periodDays: 30,
        truncated: rows.length === 10000,
        ...humanResponseSla(rows),
      };
    },
  );
  const recovery = setInterval(
    () =>
      void pool()
        .then((p) =>
          p.query(
            "UPDATE workspace_leads l SET ai_paused=true,ai_control_revision=ai_control_revision+1,handoff_reason='Conversa do site precisa de atendimento humano' WHERE l.ai_paused=false AND l.id IN(SELECT lead_id FROM website_chat_messages WHERE turn_state='pending' AND created_at<now()-interval '4 minutes')",
          ),
        )
        .then(() => pool())
        .then((p) =>
          p.query(
            "UPDATE website_chat_messages SET turn_state='cancelled' WHERE turn_state='pending' AND created_at<now()-interval '4 minutes'",
          ),
        )
        .catch(() => undefined),
    60000,
  );
  recovery.unref();
  app.addHook('onClose', async () => {
    clearInterval(recovery);
  });
}
