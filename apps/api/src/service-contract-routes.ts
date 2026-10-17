import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { DatabaseConnectionResult } from '@dcfoundry/db';
import { ContractGenerationInput, DocumentInput } from '@dcfoundry/shared';
import { z } from 'zod';
import { requirePermission } from './plugins/auth.js';
import { requestActor, scopedLead } from './agency-access.js';
import { ServiceContractStore, sha256 } from './service-contracts.js';
import {
  contractUrl,
  flushContractDeliveries,
  smtpMailer,
  type ContractMailer,
} from './contract-delivery.js';
import { seal, unseal } from './private-fields.js';
import { WorkspaceError } from './module-store.js';
import { applyFoundryControl } from './foundry-control.js';
import type { registerWhatsAppRoutes } from './whatsapp-routes.js';
const uuid = z.string().uuid();
const signature = z.object({
  name: z.string().trim().min(2).max(180),
  document: DocumentInput,
  documentHash: z.string().regex(/^[a-f0-9]{64}$/),
  accepted: z.literal(true),
});
export async function registerServiceContractRoutes(
  app: FastifyInstance,
  database: () => Promise<DatabaseConnectionResult> | null,
  whatsapp: Awaited<ReturnType<typeof registerWhatsAppRoutes>>,
  provided?: ContractMailer,
) {
  const repo = async () => {
    const db = await database();
    if (!db) throw new WorkspaceError(503, 'Configure o PostgreSQL.');
    return new ServiceContractStore(db.pool);
  };
  const mailer = provided ?? smtpMailer();
  let flushing = false;
  const flush = async () => {
    if (flushing || !mailer) return;
    flushing = true;
    try {
      await flushContractDeliveries((await repo()).pool, mailer);
    } finally {
      flushing = false;
    }
  };
  const timer = setInterval(() => void flush().catch(() => undefined), 30000);
  timer.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer);
  });
  app.get(
    '/api/v1/service-contracts',
    { preHandler: [requirePermission('contract:read')] },
    async (req) => ({ items: await (await repo()).list(requestActor(req, 'contract:read')) }),
  );
  app.post(
    '/api/v1/service-contracts',
    { preHandler: [requirePermission('contract:create')] },
    async (req, reply) =>
      reply
        .status(201)
        .send(
          await (
            await repo()
          ).generate(requestActor(req, 'contract:create'), ContractGenerationInput.parse(req.body)),
        ),
  );
  app.get(
    '/api/v1/service-contracts/:id',
    { preHandler: [requirePermission('contract:read')] },
    async (req) => {
      const store = await repo(),
        row = await store.get(
          uuid.parse((req.params as { id: string }).id),
          requestActor(req, 'contract:read'),
        );
      return store.detail(row, true);
    },
  );
  const link = async (store: ServiceContractStore, row: Record<string, any>) => {
    if (row.status === 'cancelled') throw new WorkspaceError(409, 'O contrato foi cancelado.');
    let token = unseal(row.token_ciphertext);
    if (new Date(row.token_expires_at).getTime() <= Date.now()) {
      token = randomBytes(32).toString('hex');
      const renewed = await store.pool.query(
        "UPDATE service_contracts SET token_hash=$2,token_ciphertext=$3,token_expires_at=now()+interval '7 days' WHERE id=$1 AND token_expires_at<=now() RETURNING token_ciphertext",
        [row.id, sha256(token), seal(token)],
      );
      token = unseal(
        renewed.rows[0]?.token_ciphertext ??
          (
            await store.pool.query('SELECT token_ciphertext FROM service_contracts WHERE id=$1', [
              row.id,
            ])
          ).rows[0].token_ciphertext,
      );
    }
    return contractUrl(token);
  };
  app.post(
    '/api/v1/service-contracts/:id/link',
    { preHandler: [requirePermission('contract:update')] },
    async (req) => {
      const store = await repo(),
        row = await store.get(
          uuid.parse((req.params as { id: string }).id),
          requestActor(req, 'contract:update'),
        );
      return { url: await link(store, row) };
    },
  );
  app.post(
    '/api/v1/service-contracts/:id/sign',
    { preHandler: [requirePermission('contract:approve')] },
    async (req) => {
      const store = await repo(),
        row = await store.get(
          uuid.parse((req.params as { id: string }).id),
          requestActor(req, 'contract:approve'),
        ),
        input = signature.parse(req.body);
      return store.sign(
        row,
        'provider',
        input,
        req.ip,
        String(req.headers['user-agent'] ?? ''),
        req.authUser!.id,
      );
    },
  );
  app.post(
    '/api/v1/service-contracts/:id/cancel',
    { preHandler: [requirePermission('contract:approve')] },
    async (req) => {
      const store = await repo(),
        row = await store.get(
          uuid.parse((req.params as { id: string }).id),
          requestActor(req, 'contract:approve'),
        ),
        reason = z.object({ reason: z.string().trim().min(10).max(1000) }).parse(req.body).reason,
        client = await store.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM service_contracts WHERE id=$1 FOR UPDATE', [row.id]);
        if (
          (await client.query('SELECT id FROM contract_signatures WHERE contract_id=$1', [row.id]))
            .rows.length
        )
          throw new WorkspaceError(
            409,
            'Um contrato com assinatura preserva suas evidências. Registre o encerramento pelo atendimento.',
          );
        await client.query("UPDATE service_contracts SET status='cancelled' WHERE id=$1", [row.id]);
        await client.query(
          `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,'contract.cancelled','service_contract',$2,$3)`,
          [req.authUser!.id, row.id, JSON.stringify({ reason })],
        );
        await client.query('COMMIT');
        return { cancelled: true };
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
  );
  app.get(
    '/api/public/service-contracts/:token',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const store = await repo(),
        row = await store.publicDocument(String((req.params as { token: string }).token));
      return reply
        .header('Cache-Control', 'no-store')
        .header('X-Robots-Tag', 'noindex, nofollow')
        .send(await store.detail(row));
    },
  );
  app.post(
    '/api/public/service-contracts/:token/sign',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const store = await repo(),
        row = await store.publicDocument(String((req.params as { token: string }).token)),
        input = signature.parse(req.body);
      return reply
        .header('Cache-Control', 'no-store')
        .send(
          await store.sign(
            row,
            'client',
            input,
            req.ip,
            String(req.headers['user-agent'] ?? ''),
            null,
          ),
        );
    },
  );
  app.get(
    '/api/v1/service-contracts/:id/deliveries',
    { preHandler: [requirePermission('contract:read')] },
    async (req) => {
      const store = await repo(),
        row = await store.get(
          uuid.parse((req.params as { id: string }).id),
          requestActor(req, 'contract:read'),
        );
      return {
        items: (
          await store.pool.query(
            'SELECT d.id,d.channel,d.recipient,COALESCE(m.delivery,d.status) AS status,d.attempts,d.sent_at,d.created_at FROM contract_deliveries d LEFT JOIN wa_messages m ON m.id=d.wa_message_id WHERE d.contract_id=$1 ORDER BY d.created_at DESC LIMIT 50',
            [row.id],
          )
        ).rows,
      };
    },
  );
  app.post(
    '/api/v1/service-contracts/:id/deliveries',
    { preHandler: [requirePermission('contract:update')] },
    async (req, reply) => {
      const store = await repo(),
        row = await store.get(
          uuid.parse((req.params as { id: string }).id),
          requestActor(req, 'contract:update'),
        ),
        input = z
          .object({
            channel: z.enum(['email', 'whatsapp']),
            to: z.string().email().optional(),
            requestId: uuid,
          })
          .parse(req.body);
      if (input.channel === 'email' && !mailer)
        throw new WorkspaceError(
          503,
          'Configure SMTP_HOST, SMTP_PORT e SMTP_FROM no servidor para enviar e-mail.',
        );
      const url = await link(store, row);
      let session: Record<string, any> | undefined,
        lead: Record<string, any> | undefined,
        jid: string | undefined;
      if (input.channel === 'whatsapp') {
        lead = await scopedLead(store.pool, req, row.lead_id, 'whatsapp:create');
        session = (
          await store.pool.query(
            "SELECT * FROM wa_sessions WHERE provider='baileys' AND status='connected' AND enabled=true LIMIT 1",
          )
        ).rows[0];
        if (!session || !/^\+[1-9]\d{7,14}$/.test(lead!.phone))
          throw new WorkspaceError(409, 'Conecte o WhatsApp e confira o telefone do cliente.');
        jid =
          (
            await store.pool.query(
              'SELECT jid FROM wa_identities WHERE session_id=$1 AND lead_id=$2 ORDER BY created_at DESC LIMIT 1',
              [session.id, row.lead_id],
            )
          ).rows[0]?.jid ?? lead!.phone.slice(1) + '@s.whatsapp.net';
      }
      const recipient = input.channel === 'email' ? (input.to ?? row.client_email) : lead!.phone;
      if (input.channel === 'email' && !z.string().email().safeParse(recipient).success)
        throw new WorkspaceError(400, 'Informe o e-mail do destinatário.');
      const client = await store.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.requestId]);
        const old = (
          await client.query('SELECT * FROM contract_deliveries WHERE request_id=$1', [
            input.requestId,
          ])
        ).rows[0];
        if (
          old &&
          (old.contract_id !== row.id ||
            old.channel !== input.channel ||
            old.recipient !== recipient)
        )
          throw new WorkspaceError(409, 'Identificador de envio já utilizado.');
        if (!old) {
          const messageId = input.channel === 'whatsapp' ? randomUUID() : null;
          if (messageId) {
            await applyFoundryControl(client, row.lead_id, true, undefined, req.authUser!.id);
            const text = `Olá, ${row.client_name}. Confira o contrato e as condições antes de assinar: ${url}`;
            await client.query(
              `INSERT INTO wa_messages(id,session_id,lead_id,external_id,jid,direction,actor_type,actor_id,body,sent_at,delivery) VALUES($1,$2,$3,$4,$5,'outbound','human',$6,$7,now(),'queued')`,
              [
                messageId,
                session!.id,
                row.lead_id,
                messageId.replaceAll('-', '').toUpperCase(),
                jid,
                req.authUser!.id,
                text,
              ],
            );
            await client.query(
              `INSERT INTO wa_commands(id,session_id,generation,command_type,message_id,jid,body) VALUES($1,$2,$3,'send',$1,$4,$5)`,
              [messageId, session!.id, session!.generation, jid, text],
            );
          }
          await client.query(
            'INSERT INTO contract_deliveries(contract_id,owner_id,channel,recipient,request_id,wa_message_id) VALUES($1,$2,$3,$4,$5,$6)',
            [row.id, req.authUser!.id, input.channel, recipient, input.requestId, messageId],
          );
          await client.query(
            `INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,'contract.delivery_queued','service_contract',$2,$3)`,
            [req.authUser!.id, row.id, JSON.stringify({ channel: input.channel })],
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      if (input.channel === 'whatsapp') {
        await whatsapp.syncControl(row.lead_id).catch(() => undefined);
        await whatsapp.flush().catch(() => undefined);
      } else await flush();
      return reply.status(202).send({ queued: true });
    },
  );
}
