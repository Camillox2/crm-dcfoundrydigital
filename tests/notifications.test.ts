import { it, expect, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers/database.js';
import { buildApiServer } from '../apps/api/src/app.js';
import { signAccessToken } from '../apps/api/src/plugins/auth.js';
import {
  allowedPushEndpoint,
  flushNotificationPush,
  notificationMaintenance,
} from '../apps/api/src/notifications.js';
it('only permits HTTPS endpoints of supported push providers', () => {
  expect(allowedPushEndpoint('https://fcm.googleapis.com/fcm/send/test')).toBe(true);
  expect(allowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/test')).toBe(true);
  for (const endpoint of [
    'http://127.0.0.1/x',
    'https://127.0.0.1/x',
    'https://fcm.googleapis.com.evil.test/x',
    'https://user@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:8000/x',
    'https://evil.test',
  ])
    expect(allowedPushEndpoint(endpoint)).toBe(false);
});
it('persists scoped alerts, sends mocked push and removes expired subscriptions without leaking customers', async () => {
  const previous = process.env.ENCRYPTION_MASTER_KEY_HEX;
  process.env.ENCRYPTION_MASTER_KEY_HEX = randomBytes(32).toString('hex');
  const db = await testDatabase(),
    owner = randomUUID(),
    other = randomUUID();
  await db.pool.query(
    "INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'owner@push.test','Owner','hash'),($2,'other@push.test','Other','hash')",
    [owner, other],
  );
  const send = vi.fn(async () => ({ statusCode: 201 })),
    { app, whatsapp } = await buildApiServer({
      testDatabase: db,
      pushSender: send,
      whatsappTransport: { publish: async () => {}, close: async () => {} },
    });
  const auth = (id: string) => ({
      authorization:
        'Bearer ' +
        signAccessToken({
          id,
          email: id + '@test.dev',
          fullName: 'Test',
          roles: ['admin'],
          teamId: null,
          totpEnabled: false,
        }),
    }),
    headers = auth(owner),
    call = (method: any, url: string, payload?: any, h = headers) =>
      app.inject({ method, url, payload, headers: h });
  try {
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
    };
    expect((await call('POST', '/api/v1/notifications/push', subscription)).statusCode).toBe(201);
    expect(
      (
        await call('POST', '/api/v1/notifications/push', {
          ...subscription,
          endpoint: 'http://localhost/test',
        })
      ).statusCode,
    ).toBe(400);
    const lead = (
      await call('POST', '/api/v1/workspace/leads', {
        name: 'Pessoa privada',
        company: 'Site privado',
        phone: '+5541999999966',
      })
    ).json().item;
    const alerts = (await call('GET', '/api/v1/notifications')).json();
    expect(alerts.unread).toBe(1);
    expect(alerts.items[0].kind).toBe('new_lead');
    expect(
      (await call('GET', '/api/v1/notifications', undefined, auth(other))).json().items,
    ).toHaveLength(0);
    await call('POST', '/api/v1/notifications/read', { id: alerts.items[0].id }, auth(other));
    expect((await call('GET', '/api/v1/notifications')).json().unread).toBe(1);
    await flushNotificationPush(db.pool, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![1]).not.toContain('Pessoa privada');
    await flushNotificationPush(db.pool, send);
    expect(send).toHaveBeenCalledTimes(1);
    await call('POST', '/api/v1/notifications/read', { all: true });
    expect((await call('GET', '/api/v1/notifications')).json().unread).toBe(0);
    const sessionId = await (
      await whatsapp.store()
    ).connect(
      { id: owner, scope: 'all', teamId: null },
      { provider: 'baileys', importHistory: false },
    );
    await whatsapp.processEvent({
      id: randomUUID(),
      sessionId,
      generation: 1,
      type: 'status',
      status: 'connected',
    });
    await db.pool.query(
      "UPDATE wa_sessions SET heartbeat_at=now()-interval '2 minutes' WHERE id=$1",
      [sessionId],
    );
    await notificationMaintenance(db.pool);
    await notificationMaintenance(db.pool);
    expect(
      (await db.pool.query("SELECT kind FROM crm_notifications WHERE kind='whatsapp_down'")).rows,
    ).toHaveLength(1);
    await db.pool.query(
      "INSERT INTO calendar_events(owner_id,lead_id,title,kind,starts_at,ends_at) VALUES($1,$2,'Reunião teste','meeting',now()+interval '5 minutes',now()+interval '35 minutes')",
      [owner, lead.id],
    );
    await notificationMaintenance(db.pool);
    await notificationMaintenance(db.pool);
    expect(
      (await db.pool.query("SELECT kind FROM crm_notifications WHERE kind='calendar_reminder'"))
        .rows,
    ).toHaveLength(1);
    const expired = vi.fn(async () => {
      throw { statusCode: 410 };
    });
    await flushNotificationPush(db.pool, expired);
    expect((await db.pool.query('SELECT * FROM push_subscriptions')).rows).toHaveLength(0);
    expect((await db.pool.query('SELECT * FROM notification_push_deliveries')).rows).toHaveLength(
      0,
    );
  } finally {
    await app.close();
    await db.pool.end();
    if (previous === undefined) delete process.env.ENCRYPTION_MASTER_KEY_HEX;
    else process.env.ENCRYPTION_MASTER_KEY_HEX = previous;
  }
}, 30000);
