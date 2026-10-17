import webpush from 'web-push';
import { z } from 'zod';
import type { CrmPool } from './agency-access.js';
import { seal, unseal } from './private-fields.js';
export function allowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      (url.hostname === 'fcm.googleapis.com' ||
        url.hostname === 'updates.push.services.mozilla.com' ||
        url.hostname.endsWith('.push.services.mozilla.com') ||
        url.hostname.endsWith('.push.apple.com') ||
        url.hostname.endsWith('.notify.windows.com'))
    );
  } catch {
    return false;
  }
}
export const PushSubscriptionInput = z.object({
  endpoint: z.string().max(2048).refine(allowedPushEndpoint, 'Serviço de push não reconhecido.'),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{20,30}$/),
  }),
});
export type PushSender = (
  subscription: webpush.PushSubscription,
  payload: string,
) => Promise<{ statusCode: number }>;
export function configuredPush(): PushSender | undefined {
  const publicKey = process.env.VAPID_PUBLIC_KEY,
    privateKey = process.env.VAPID_PRIVATE_KEY,
    subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return;
  return (subscription, payload) =>
    webpush.sendNotification(subscription, payload, {
      TTL: 300,
      timeout: 5000,
      vapidDetails: { subject, publicKey, privateKey },
    });
}
export async function notificationMaintenance(pool: CrmPool) {
  await pool.query(
    "UPDATE wa_sessions SET status='reconnecting',qr=NULL,pairing_code=NULL,updated_at=now() WHERE provider='baileys' AND status='connected' AND enabled AND heartbeat_at<now()-interval '90 seconds'",
  );
  await pool.query(
    "INSERT INTO crm_notifications(user_id,event_key,kind,title,body,page,entity_id) SELECT owner_id,'calendar:'||id||':'||version,'calendar_reminder','Compromisso em breve','Confira os próximos compromissos da sua agenda.','agenda',id FROM calendar_events WHERE status='scheduled' AND starts_at>now() AND starts_at<=now()+interval '15 minutes' ON CONFLICT DO NOTHING",
  );
}
export async function flushNotificationPush(pool: CrmPool, send: PushSender) {
  for (let i = 0; i < 10; i++) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const row = (
        await c.query(
          "SELECT d.*,s.endpoint,s.p256dh,s.auth_ciphertext,n.title,n.body,n.page FROM notification_push_deliveries d JOIN push_subscriptions s ON s.id=d.subscription_id JOIN crm_notifications n ON n.id=d.notification_id AND n.user_id=s.user_id WHERE d.status='queued' AND d.attempts<5 AND d.next_attempt_at<=now() ORDER BY d.next_attempt_at LIMIT 1 FOR UPDATE OF d SKIP LOCKED",
        )
      ).rows[0];
      if (!row) {
        await c.query('COMMIT');
        break;
      }
      let code = 0;
      try {
        if (!allowedPushEndpoint(row.endpoint)) code = 410;
        else
          code = (
            await send(
              {
                endpoint: row.endpoint,
                keys: { p256dh: row.p256dh, auth: unseal(row.auth_ciphertext) },
              },
              JSON.stringify({
                title: row.title,
                body: row.body,
                tag: row.notification_id,
                url: '/',
              }),
            )
          ).statusCode;
      } catch (e) {
        code = Number((e as { statusCode?: number }).statusCode ?? 0);
      }
      if ([404, 410].includes(code))
        await c.query('DELETE FROM push_subscriptions WHERE id=$1', [row.subscription_id]);
      else
        await c.query(
          "UPDATE notification_push_deliveries SET attempts=attempts+1,status=CASE WHEN $3::int BETWEEN 200 AND 299 THEN 'push_accepted' WHEN attempts>=4 THEN 'failed' ELSE 'queued' END,last_status=$3,accepted_at=CASE WHEN $3::int BETWEEN 200 AND 299 THEN now() ELSE NULL END,next_attempt_at=now()+(power(2,attempts+1)*30)*interval '1 second' WHERE notification_id=$1 AND subscription_id=$2",
          [row.notification_id, row.subscription_id, code],
        );
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
}
export { seal };
