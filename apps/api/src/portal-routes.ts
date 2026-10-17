import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { DatabaseConnectionResult } from '@dcfoundry/db';
import { z } from 'zod';
import { requirePermission } from './plugins/auth.js';
import { requestActor, scopedLead } from './agency-access.js';
import { WorkspaceError } from './module-store.js';
import { sha256 } from './service-contracts.js';
import { unseal } from './private-fields.js';
const uuid = z.string().uuid();
export const ServiceRequestInput = z.object({
  title: z.string().trim().min(3).max(180),
  kind: z.enum(['adjustment', 'support', 'maintenance']),
  description: z.string().trim().min(5).max(10000),
});
const updateRequest = z.object({
  message: z.string().trim().min(1).max(10000),
  status: z.enum(['open', 'in_progress', 'waiting_client', 'resolved', 'cancelled']).optional(),
  version: z.number().int().positive(),
});
export async function registerPortalRoutes(
  app: FastifyInstance,
  database: () => Promise<DatabaseConnectionResult> | null,
) {
  const pool = async () => {
    const db = await database();
    if (!db) throw new WorkspaceError(503, 'Configure o PostgreSQL.');
    return db.pool;
  };
  const portal = async (token: string) => {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new WorkspaceError(404, 'Link indisponível.');
    const p = await pool(),
      row = (
        await p.query(
          'SELECT p.* FROM client_portal_links p JOIN workspace_leads l ON l.id=p.lead_id WHERE p.token_hash=$1 AND p.revoked_at IS NULL AND p.expires_at>now() AND l.archived_at IS NULL',
          [sha256(token)],
        )
      ).rows[0];
    if (!row) throw new WorkspaceError(404, 'Link expirado ou indisponível.');
    return row;
  };
  const list = async (leadId: string) =>
    (
      await (
        await pool()
      ).query(
        'SELECT * FROM service_requests WHERE lead_id=$1 ORDER BY updated_at DESC LIMIT 100',
        [leadId],
      )
    ).rows;
  const events = async (id: string) =>
    (
      await (
        await pool()
      ).query(
        'SELECT id,actor_type,message,status,created_at FROM service_request_events WHERE request_id=$1 ORDER BY created_at,id',
        [id],
      )
    ).rows;
  const create = async (lead: any, body: unknown, actorId: string | null) => {
    const input = ServiceRequestInput.parse(body),
      p = await pool(),
      c = await p.connect();
    try {
      await c.query('BEGIN');
      const row = (
        await c.query(
          'INSERT INTO service_requests(lead_id,owner_id,title,kind,description) VALUES($1,$2,$3,$4,$5) RETURNING *',
          [lead.id, lead.owner_id, input.title, input.kind, input.description],
        )
      ).rows[0];
      await c.query(
        'INSERT INTO service_request_events(request_id,actor_type,actor_id,message,status) VALUES($1,$2,$3,$4,$5)',
        [row.id, actorId ? 'user' : 'client', actorId, input.description, 'open'],
      );
      await c.query(
        "INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES($1,$2,'service_request.create','service_request',$3,$4)",
        [
          actorId ? 'user' : 'client',
          actorId,
          row.id,
          JSON.stringify({ leadId: lead.id, kind: input.kind }),
        ],
      );
      await c.query('COMMIT');
      return row;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  };
  const update = async (id: string, leadId: string, body: unknown, actorId: string | null) => {
    const input = updateRequest.parse(body),
      c = await (await pool()).connect();
    try {
      await c.query('BEGIN');
      const row = (
        await c.query('SELECT * FROM service_requests WHERE id=$1 AND lead_id=$2 FOR UPDATE', [
          id,
          leadId,
        ])
      ).rows[0];
      if (!row) throw new WorkspaceError(404, 'Solicitação indisponível.');
      if (row.version !== input.version)
        throw new WorkspaceError(409, 'A solicitação mudou. Atualize a tela.');
      if (!actorId && input.status)
        throw new WorkspaceError(403, 'Somente a equipe altera o status.');
      const status = input.status ?? row.status;
      const next = (
        await c.query(
          'UPDATE service_requests SET status=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *',
          [id, status],
        )
      ).rows[0];
      await c.query(
        'INSERT INTO service_request_events(request_id,actor_type,actor_id,message,status) VALUES($1,$2,$3,$4,$5)',
        [id, actorId ? 'user' : 'client', actorId, input.message, status],
      );
      await c.query(
        "INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES($1,$2,'service_request.update','service_request',$3,$4)",
        [
          actorId ? 'user' : 'client',
          actorId,
          id,
          JSON.stringify({ status, version: next.version }),
        ],
      );
      await c.query('COMMIT');
      return next;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  };
  app.post(
    '/api/v1/leads/:id/portal',
    { preHandler: [requirePermission('lead:update')] },
    async (req) => {
      const p = await pool(),
        lead = await scopedLead(p, req, uuid.parse((req.params as any).id), 'lead:update'),
        token = randomBytes(32).toString('hex');
      const row = (
        await p.query(
          "INSERT INTO client_portal_links(lead_id,owner_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '30 days') RETURNING id,expires_at",
          [lead.id, lead.owner_id, sha256(token)],
        )
      ).rows[0];
      await p.query(
        "INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,'portal.issue','lead',$2,$3)",
        [req.authUser!.id, lead.id, JSON.stringify({ portalId: row.id })],
      );
      return { ...row, path: '/portal/' + token };
    },
  );
  app.delete(
    '/api/v1/leads/:id/portal/:link',
    { preHandler: [requirePermission('lead:update')] },
    async (req) => {
      const p = await pool(),
        params = req.params as any;
      await scopedLead(p, req, uuid.parse(params.id), 'lead:update');
      await p.query('UPDATE client_portal_links SET revoked_at=now() WHERE id=$1 AND lead_id=$2', [
        uuid.parse(params.link),
        params.id,
      ]);
      return { revoked: true };
    },
  );
  app.get(
    '/api/v1/leads/:id/requests',
    { preHandler: [requirePermission('task:read')] },
    async (req) => {
      const lead = await scopedLead(await pool(), req, uuid.parse((req.params as any).id));
      await scopedLead(await pool(), req, lead.id, 'task:read');
      return { items: await list(lead.id) };
    },
  );
  app.post(
    '/api/v1/leads/:id/requests',
    { preHandler: [requirePermission('task:create')] },
    async (req, reply) => {
      const lead = await scopedLead(await pool(), req, uuid.parse((req.params as any).id));
      await scopedLead(await pool(), req, lead.id, 'task:create');
      return reply.code(201).send({ item: await create(lead, req.body, req.authUser!.id) });
    },
  );
  app.get('/api/v1/requests/:id', { preHandler: [requirePermission('task:read')] }, async (req) => {
    const row = (
      await (
        await pool()
      ).query('SELECT * FROM service_requests WHERE id=$1', [uuid.parse((req.params as any).id)])
    ).rows[0];
    if (!row) throw new WorkspaceError(404, 'Solicitação indisponível.');
    await scopedLead(await pool(), req, row.lead_id);
    await scopedLead(await pool(), req, row.lead_id, 'task:read');
    return { item: row, events: await events(row.id) };
  });
  app.post(
    '/api/v1/requests/:id/events',
    { preHandler: [requirePermission('task:update')] },
    async (req) => {
      const row = (
        await (
          await pool()
        ).query('SELECT * FROM service_requests WHERE id=$1', [uuid.parse((req.params as any).id)])
      ).rows[0];
      if (!row) throw new WorkspaceError(404, 'Solicitação indisponível.');
      await scopedLead(await pool(), req, row.lead_id, 'lead:update');
      await scopedLead(await pool(), req, row.lead_id, 'task:update');
      return { item: await update(row.id, row.lead_id, req.body, req.authUser!.id) };
    },
  );
  const publicConfig = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.startsWith('/api/public/portal/'))
      reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer');
    return payload;
  });
  app.get('/api/public/portal/:token', publicConfig, async (req) => {
    const link = await portal((req.params as any).token),
      p = await pool();
    const lead = (
      await p.query('SELECT name,company FROM workspace_leads WHERE id=$1', [link.lead_id])
    ).rows[0];
    const proposals = (
      await p.query(
        "SELECT id,title,scope,terms,value_cents,billing,status,version,valid_until FROM agency_proposals WHERE lead_id=$1 AND archived_at IS NULL AND status IN('sent','accepted','active','completed') ORDER BY updated_at DESC",
        [link.lead_id],
      )
    ).rows;
    const contracts = (
      await p.query(
        "SELECT id,title,status,created_at,token_ciphertext,token_expires_at FROM service_contracts WHERE lead_id=$1 AND status<>'cancelled' ORDER BY created_at DESC",
        [link.lead_id],
      )
    ).rows.map(({ token_ciphertext, token_expires_at, ...row }) => ({
      ...row,
      signaturePath:
        new Date(token_expires_at).getTime() > Date.now()
          ? '/assinar/' + unseal(token_ciphertext)
          : null,
    }));
    const charges = (
      await p.query(
        "SELECT id,data->>'title' AS title,data->>'amountCents' AS amount_cents,data->>'dueDate' AS due_date,data->>'status' AS status,data->>'receipt' AS receipt FROM workspace_documents WHERE kind='invoice' AND lead_id=$1 AND archived_at IS NULL ORDER BY created_at DESC",
        [link.lead_id],
      )
    ).rows;
    return {
      client: lead,
      expiresAt: link.expires_at,
      proposals,
      contracts,
      charges,
      requests: await list(link.lead_id),
    };
  });
  app.post('/api/public/portal/:token/proposals/:id/accept', publicConfig, async (req) => {
    const params = req.params as any,
      link = await portal(params.token),
      input = z
        .object({
          name: z.string().trim().min(2).max(180),
          version: z.number().int().positive(),
          accepted: z.literal(true),
        })
        .parse(req.body),
      c = await (await pool()).connect();
    try {
      await c.query('BEGIN');
      const row = (
        await c.query(
          'SELECT * FROM agency_proposals WHERE id=$1 AND lead_id=$2 AND archived_at IS NULL FOR UPDATE',
          [uuid.parse(params.id), link.lead_id],
        )
      ).rows[0];
      if (!row) throw new WorkspaceError(404, 'Proposta indisponível.');
      if (row.status === 'accepted' && row.version === input.version + 1) {
        await c.query('COMMIT');
        return { accepted: true, version: row.version };
      }
      if (row.version !== input.version)
        throw new WorkspaceError(409, 'A proposta mudou. Leia a versão atual.');
      if (
        row.status !== 'sent' ||
        (row.valid_until && new Date(row.valid_until).getTime() + 86400000 < Date.now())
      )
        throw new WorkspaceError(409, 'A proposta não está disponível para aceite.');
      const fields = [
        'lead_id',
        'title',
        'client',
        'client_document_ciphertext',
        'client_email',
        'client_address',
        'client_representative',
        'service_type',
        'value_cents',
        'upfront_cents',
        'installments',
        'payment_day',
        'billing',
        'status',
        'scope',
        'terms',
        'valid_until',
      ];
      await c.query(
        'INSERT INTO agency_proposals_versions(document_id,version,' +
          fields.join(',') +
          ',actor_id,actor_type) SELECT id,version,' +
          fields.join(',') +
          ",NULL,'client' FROM agency_proposals WHERE id=$1",
        [row.id],
      );
      await c.query(
        "UPDATE agency_proposals SET status='accepted',version=version+1,updated_at=now() WHERE id=$1",
        [row.id],
      );
      await c.query(
        'INSERT INTO proposal_acceptances(proposal_id,proposal_version,portal_id,name,ip_address,user_agent) VALUES($1,$2,$3,$4,$5,$6)',
        [
          row.id,
          row.version,
          link.id,
          input.name,
          req.ip.slice(0, 64),
          String(req.headers['user-agent'] ?? '').slice(0, 500),
        ],
      );
      await c.query(
        "INSERT INTO audit_logs(actor_type,action,entity_type,entity_id,diff_json) VALUES('client','proposal.accept','contract',$1,$2)",
        [row.id, JSON.stringify({ version: row.version + 1, portalId: link.id })],
      );
      await c.query('COMMIT');
      return { accepted: true, version: row.version + 1 };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  });
  app.post('/api/public/portal/:token/requests', publicConfig, async (req, reply) => {
    const link = await portal((req.params as any).token);
    return reply
      .code(201)
      .send({ item: await create({ id: link.lead_id, owner_id: link.owner_id }, req.body, null) });
  });
  app.get('/api/public/portal/:token/requests/:id', publicConfig, async (req) => {
    const params = req.params as any,
      link = await portal(params.token),
      row = (
        await (
          await pool()
        ).query('SELECT * FROM service_requests WHERE id=$1 AND lead_id=$2', [
          uuid.parse(params.id),
          link.lead_id,
        ])
      ).rows[0];
    if (!row) throw new WorkspaceError(404, 'Solicitação indisponível.');
    return { item: row, events: await events(row.id) };
  });
  app.post('/api/public/portal/:token/requests/:id/events', publicConfig, async (req) => {
    const params = req.params as any,
      link = await portal(params.token);
    return { item: await update(uuid.parse(params.id), link.lead_id, req.body, null) };
  });
}
