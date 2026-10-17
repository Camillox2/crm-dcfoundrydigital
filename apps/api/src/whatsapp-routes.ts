import type { FastifyInstance } from 'fastify';
import type { DatabaseConnectionResult } from '@dcfoundry/db';
import { SessionInput, resolveGrantedScope } from '@dcfoundry/shared';
import { z } from 'zod';
import { requirePermission } from './plugins/auth.js';
import { WorkspaceError } from './module-store.js';
import { WhatsAppStore } from './whatsapp-store.js';
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
  const store = async () => {
    const db = await database();
    if (!db) throw new WorkspaceError(503, 'Configure o PostgreSQL.');
    return new WhatsAppStore(db.pool);
  };
  const getTransport = () => {
    if (!transport && process.env.REDIS_URL)
      transport = startWhatsAppTransport(process.env.REDIS_URL, async (event) => {
        await (await store()).ingest(event);
      });
    return transport;
  };
  const flush = async () => {
    if (flushing) return;
    const bus = getTransport();
    if (!bus) return;
    flushing = true;
    try {
      await flushWhatsAppCommands(await store(), bus);
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
  app.get(
    '/api/v1/whatsapp/sessions',
    { preHandler: [requirePermission('whatsapp:read')] },
    async (req) => {
      const repo = await store();
      return {
        items: await Promise.all(
          (await repo.list(actor(req, 'read'))).map((id) => repo.session(id, actor(req, 'read'))),
        ),
        workerConfigured: Boolean(getTransport()),
      };
    },
  );
  app.post(
    '/api/v1/whatsapp/sessions',
    { preHandler: [requirePermission('whatsapp:manage')] },
    async (req, reply) => {
      if (!getTransport()) throw new WorkspaceError(503, 'Configure REDIS_URL e inicie o worker.');
      const id = await (await store()).connect(actor(req, 'manage'), SessionInput.parse(req.body));
      await flush().catch(() => undefined);
      return reply.status(202).send({ id });
    },
  );
  app.post(
    '/api/v1/whatsapp/sessions/:id/connect',
    { preHandler: [requirePermission('whatsapp:manage')] },
    async (req, reply) => {
      const id = z
        .string()
        .uuid()
        .parse((req.params as any).id);
      await (await store()).connect(actor(req, 'manage'), SessionInput.parse(req.body), id);
      await flush().catch(() => undefined);
      return reply.status(202).send({ id });
    },
  );
  for (const action of ['disconnect', 'sync'] as const)
    app.post(
      `/api/v1/whatsapp/sessions/:id/${action}`,
      { preHandler: [requirePermission('whatsapp:manage')] },
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
  return { store, flush };
}
