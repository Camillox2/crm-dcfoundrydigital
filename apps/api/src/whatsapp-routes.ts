import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseConnectionResult } from '@dcfoundry/db';
import { SessionInput, resolveGrantedScope } from '@dcfoundry/shared';
import { z } from 'zod';
import { requirePermission } from './plugins/auth.js';
import { WorkspaceError } from './module-store.js';
import { WhatsAppStore } from './whatsapp-store.js';
import { registerWhatsAppChat, WhatsAppRealtime } from './whatsapp-chat.js';
import {
  startWhatsAppTransport,
  flushWhatsAppCommands,
  type WhatsAppTransport,
} from './whatsapp-runtime.js';
type Database = () => Promise<DatabaseConnectionResult> | null;
export async function registerWhatsAppRoutes(
  app: FastifyInstance,
  database: Database,
  provided?: WhatsAppTransport,
) {
  let transport = provided;
  let flushing = false;
  const realtime = new WhatsAppRealtime();
  let agent: ((event: import('@dcfoundry/shared').WhatsAppEvent) => Promise<void>) | undefined;
  const processEvent = async (event: import('@dcfoundry/shared').WhatsAppEvent) => {
    await (await store()).ingest(event);
    realtime.receive(event);
    await agent?.(event);
  };
  const store = async () => {
    const db = await database();
    if (!db) throw new WorkspaceError(503, 'Configure o PostgreSQL.');
    return new WhatsAppStore(db.pool);
  };
  const getTransport = () => {
    if (!transport && process.env.REDIS_URL)
      transport = startWhatsAppTransport(process.env.REDIS_URL, async (event) => {
        await processEvent(event);
      });
    return transport;
  };
  const flush = async () => {
    if (flushing) return;
    const bus = getTransport();
    if (!bus) return;
    flushing = true;
    try {
      const repo = await store();
      const enabled =
        (
          await repo.pool.query(
            'SELECT whatsapp_enabled FROM foundry_settings WHERE singleton=true',
          )
        ).rows[0]?.whatsapp_enabled === true;
      await bus.enabled?.(enabled);
      await flushWhatsAppCommands(repo, bus);
    } finally {
      flushing = false;
    }
  };
  // The database outbox survives a Redis outage and is replayed idempotently.
  const timer = setInterval(() => {
    void flush().catch(() => undefined);
  }, 5000);
  timer.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer);
    await transport?.close();
  });
  const actor = (req: any, action: 'read' | 'manage') => ({
    id: req.authUser.id,
    teamId: req.authUser.teamId ?? null,
    scope: resolveGrantedScope(req.authUser.roles, `whatsapp:${action}`)!,
  });
  const adminOnly = async (req: FastifyRequest) => {
    if (!req.authUser?.roles.includes('admin'))
      throw new WorkspaceError(
        403,
        'Somente administradores podem parear ou desconectar o WhatsApp.',
      );
  };
  const connectionAccess = [requirePermission('whatsapp:manage'), adminOnly];
  const readSession = async (id: string, req: FastifyRequest) => {
    const s = await (await store()).session(id, { ...actor(req, 'read'), scope: 'all' });
    const manage = req.authUser!.roles.includes('admin');
    return {
      id: s.id,
      provider: s.provider,
      status: s.status,
      phone: s.phone,
      history_progress: s.history_progress,
      import_history: s.import_history,
      qr: manage ? s.qr : null,
      pairing_code: manage ? s.pairing_code : null,
    };
  };
  app.get(
    '/api/v1/whatsapp/sessions',
    { preHandler: [requirePermission('whatsapp:read')] },
    async (req, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      const repo = await store();
      return {
        items: await Promise.all(
          (await repo.list({ ...actor(req, 'read'), scope: 'all' })).map((id) =>
            readSession(id, req),
          ),
        ),
        workerConfigured: Boolean(getTransport()),
      };
    },
  );
  app.get(
    '/api/v1/whatsapp/status',
    { preHandler: [requirePermission('whatsapp:read')] },
    async (req, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      const id = (await (await store()).list({ ...actor(req, 'read'), scope: 'all' }))[0];
      return id
        ? readSession(id, req)
        : { id: null, status: 'disconnected', phone: null, qr: null, pairing_code: null };
    },
  );
  for (const action of ['connect', 'pair-code', 'disconnect'] as const)
    app.post('/api/v1/whatsapp/' + action, { preHandler: connectionAccess }, async (req, reply) => {
      if (!getTransport()) throw new WorkspaceError(503, 'Configure REDIS_URL e inicie o worker.');
      const repo = await store(),
        a = actor(req, 'manage'),
        id = (await repo.list(a))[0];
      if (action === 'disconnect') {
        if (id) await repo.command(id, 'disconnect', a);
      } else {
        const input = SessionInput.parse(req.body ?? {});
        if (action === 'pair-code' && !input.phone)
          throw new WorkspaceError(400, 'Informe o telefone com DDI para gerar o código.');
        const sessionId = await repo.connect(a, input, id);
        await flush().catch(() => undefined);
        return reply.status(202).send({ id: sessionId });
      }
      await flush().catch(() => undefined);
      return reply.status(202).send({ queued: true });
    });
  app.post('/api/v1/whatsapp/sessions', { preHandler: connectionAccess }, async (req, reply) => {
    if (!getTransport()) throw new WorkspaceError(503, 'Configure REDIS_URL e inicie o worker.');
    const id = await (await store()).connect(actor(req, 'manage'), SessionInput.parse(req.body));
    await flush().catch(() => undefined);
    return reply.status(202).send({ id });
  });
  app.post(
    '/api/v1/whatsapp/sessions/:id/connect',
    { preHandler: connectionAccess },
    async (req, reply) => {
      const id = z
        .string()
        .uuid()
        .parse((req.params as any).id);
      if (!getTransport()) throw new WorkspaceError(503, 'Configure REDIS_URL e inicie o worker.');
      await (await store()).connect(actor(req, 'manage'), SessionInput.parse(req.body), id);
      await flush().catch(() => undefined);
      return reply.status(202).send({ id });
    },
  );
  for (const action of ['disconnect', 'sync'] as const)
    app.post(
      `/api/v1/whatsapp/sessions/:id/${action}`,
      {
        preHandler:
          action === 'disconnect' ? connectionAccess : [requirePermission('whatsapp:manage')],
      },
      async (req, reply) => {
        await (
          await store()
        ).command(
          z
            .string()
            .uuid()
            .parse((req.params as any).id),
          action,
          actor(req, 'manage'),
        );
        await flush().catch(() => undefined);
        return reply.status(202).send({ queued: true });
      },
    );
  await registerWhatsAppChat(app, store, flush, realtime, (id) => syncControl(id));
  const syncControl = async (id: string) => {
    const repo = await store(),
      lead = (
        await repo.pool.query(
          'SELECT ai_paused,ai_control_revision FROM workspace_leads WHERE id=$1',
          [id],
        )
      ).rows[0];
    if (lead) await getTransport()?.control?.(id, lead.ai_control_revision, lead.ai_paused);
  };
  return {
    store,
    flush,
    realtime,
    processEvent,
    syncControl,
    setAgent: (handler: typeof agent) => {
      agent = handler;
    },
    setAgentEnabled: async (enabled: boolean) => {
      await getTransport()?.enabled?.(enabled);
    },
  };
}
