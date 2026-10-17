import type { FastifyInstance } from 'fastify';
import type { DatabaseConnectionResult } from '@dcfoundry/db';
import { z } from 'zod';
import { requireSession } from './plugins/auth.js';
import { WorkspaceError } from './module-store.js';
import { sha256 } from './service-contracts.js';
import {
  PushSubscriptionInput,
  configuredPush,
  notificationMaintenance,
  flushNotificationPush,
  seal,
  type PushSender,
} from './notifications.js';
export async function registerNotificationRoutes(
  app: FastifyInstance,
  database: () => Promise<DatabaseConnectionResult> | null,
  provided?: PushSender,
) {
  const pool = async () => {
      const db = await database();
      if (!db) throw new WorkspaceError(503, 'Configure o PostgreSQL.');
      return db.pool;
    },
    send = provided ?? configuredPush();
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const p = await pool();
      await notificationMaintenance(p);
      if (send) await flushNotificationPush(p, send);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick().catch(() => undefined), 30000);
  timer.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer);
  });
  const auth = { preHandler: [requireSession] };
  app.get('/api/v1/notifications', auth, async (req) => ({
    items: (
      await (
        await pool()
      ).query(
        'SELECT id,kind,title,body,page,entity_id,read_at,created_at FROM crm_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
        [req.authUser!.id],
      )
    ).rows,
    unread: Number(
      (
        await (
          await pool()
        ).query(
          'SELECT count(*) AS n FROM crm_notifications WHERE user_id=$1 AND read_at IS NULL',
          [req.authUser!.id],
        )
      ).rows[0].n,
    ),
  }));
  app.post('/api/v1/notifications/read', auth, async (req) => {
    const input = z
      .object({ id: z.string().uuid().optional(), all: z.boolean().optional() })
      .refine((v) => Boolean(v.id) || v.all === true)
      .parse(req.body);
    await (
      await pool()
    ).query(
      'UPDATE crm_notifications SET read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND ($2::uuid IS NULL OR id=$2)',
      [req.authUser!.id, input.all ? null : input.id],
    );
    return { read: true };
  });
  app.get('/api/v1/notifications/push', auth, async () => ({
    configured: Boolean(send && process.env.VAPID_PUBLIC_KEY),
    publicKey: send ? (process.env.VAPID_PUBLIC_KEY ?? '') : '',
  }));
  app.post('/api/v1/notifications/push', auth, async (req, reply) => {
    if (!send) throw new WorkspaceError(503, 'Configure as chaves VAPID no servidor.');
    const v = PushSubscriptionInput.parse(req.body),
      p = await pool(),
      hash = sha256(v.endpoint),
      count = Number(
        (
          await p.query('SELECT count(*) AS n FROM push_subscriptions WHERE user_id=$1', [
            req.authUser!.id,
          ])
        ).rows[0].n,
      );
    if (count >= 10)
      throw new WorkspaceError(
        409,
        'Limite de dispositivos atingido. Remova uma inscrição anterior.',
      );
    await p.query(
      'INSERT INTO push_subscriptions(user_id,endpoint,endpoint_hash,p256dh,auth_ciphertext) VALUES($1,$2,$3,$4,$5) ON CONFLICT(endpoint_hash) DO UPDATE SET user_id=EXCLUDED.user_id,p256dh=EXCLUDED.p256dh,auth_ciphertext=EXCLUDED.auth_ciphertext',
      [req.authUser!.id, v.endpoint, hash, v.keys.p256dh, seal(v.keys.auth)],
    );
    return reply.code(201).send({ subscribed: true });
  });
  app.delete('/api/v1/notifications/push', auth, async (req) => {
    const input = z.object({ endpoint: z.string().max(2048) }).parse(req.body);
    await (
      await pool()
    ).query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint_hash=$2', [
      req.authUser!.id,
      sha256(input.endpoint),
    ]);
    return { unsubscribed: true };
  });
  return { tick };
}
