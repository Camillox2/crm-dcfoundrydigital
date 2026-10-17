import type { CrmPool } from './agency-access.js';
import { unseal } from './private-fields.js';
export function offlineAdsConfig() {
  const env = process.env,
    customer = env.GOOGLE_ADS_CUSTOMER_ID ?? '',
    login = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? customer;
  if (
    env.CRM_ADS_OFFLINE_ENABLED !== 'true' ||
    !/^\d{10}$/.test(customer) ||
    !/^\d{10}$/.test(login) ||
    !env.GOOGLE_OAUTH_CLIENT_ID ||
    !env.GOOGLE_OAUTH_CLIENT_SECRET ||
    !env.GOOGLE_OAUTH_REFRESH_TOKEN
  )
    return null;
  return {
    customer,
    login,
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    refreshToken: env.GOOGLE_OAUTH_REFRESH_TOKEN,
    validateOnly: env.CRM_ADS_VALIDATE_ONLY !== 'false',
  };
}
type Config = NonNullable<ReturnType<typeof offlineAdsConfig>>;
async function googleToken(config: Config, send: typeof fetch) {
  const response = await send('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(8000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('OAuth HTTP ' + response.status);
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('OAuth não retornou token.');
  return data.access_token;
}
export function offlinePayload(row: any, config: Config) {
  return {
    destinations: [
      {
        operatingAccount: { accountType: 'GOOGLE_ADS', accountId: config.customer },
        loginAccount: { accountType: 'GOOGLE_ADS', accountId: config.login },
        productDestinationId: row.conversion_action,
      },
    ],
    events: [
      {
        adIdentifiers: { gclid: unseal(row.gclid_ciphertext) },
        eventTimestamp: new Date(row.event_at).toISOString(),
        transactionId: row.transaction_id,
        eventSource: 'WEB',
        conversionValue: Number(row.value_cents) / 100,
        currency: 'BRL',
        consent: { adUserData: 'CONSENT_GRANTED', adPersonalization: 'CONSENT_DENIED' },
      },
    ],
    validateOnly: row.validate_only,
  };
}
export function diagnosticResult(data: any) {
  const destinations = Array.isArray(data.requestStatusPerDestination)
      ? data.requestStatusPerDestination
      : [],
    states = destinations.map((d: any) => d.requestStatus),
    warnings = destinations.reduce(
      (n: number, d: any) =>
        n +
        (d.warningInfo?.warningCounts ?? []).reduce(
          (s: number, r: any) => s + Number(r.recordCount ?? 0),
          0,
        ),
      0,
    ),
    errors = destinations.reduce(
      (n: number, d: any) =>
        n +
        (d.errorInfo?.errorCounts ?? []).reduce(
          (s: number, r: any) => s + Number(r.recordCount ?? 0),
          0,
        ),
      0,
    );
  return {
    status:
      !states.length ||
      states.some((s: string) => !['SUCCESS', 'FAILED', 'FAILURE', 'PARTIAL_SUCCESS'].includes(s))
        ? 'provider_accepted'
        : states.some((s: string) => s === 'PARTIAL_SUCCESS')
          ? 'partial_failure'
          : states.some((s: string) => ['FAILED', 'FAILURE'].includes(s))
            ? 'rejected'
            : 'processed',
    warnings,
    errors,
  };
}
export async function flushOfflineAds(pool: CrmPool, send: typeof fetch = fetch) {
  const config = offlineAdsConfig();
  if (!config) return { configured: false, processed: 0 };
  let processed = 0;
  for (let i = 0; i < 3; i++) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const row = (
        await c.query(
          "SELECT j.*,l.ad_consent FROM agency_offline_conversions j JOIN workspace_leads l ON l.id=j.lead_id WHERE ((j.status='queued' AND j.attempts<5) OR (j.status='provider_accepted' AND j.diagnostic_attempts<28)) AND j.next_attempt_at<=now() ORDER BY j.next_attempt_at LIMIT 1 FOR UPDATE OF j SKIP LOCKED",
        )
      ).rows[0];
      if (!row) {
        await c.query('COMMIT');
        break;
      }
      if (row.ad_consent !== 'granted') {
        await c.query(
          "UPDATE agency_offline_conversions SET status='consent_blocked',last_error='Consentimento não está concedido.',updated_at=now() WHERE id=$1",
          [row.id],
        );
        await c.query('COMMIT');
        continue;
      }
      try {
        const token = await googleToken(config, send);
        if (row.status === 'provider_accepted') {
          const response = await send(
            'https://datamanager.googleapis.com/v1/requestStatus:retrieve?requestId=' +
              encodeURIComponent(row.request_id),
            {
              headers: { Authorization: 'Bearer ' + token },
              signal: AbortSignal.timeout(8000),
              redirect: 'error',
            },
          );
          if (!response.ok) throw new Error('Diagnóstico HTTP ' + response.status);
          const result = diagnosticResult(await response.json()),
            expired = new Date(row.created_at).getTime() < Date.now() - 24 * 3600000;
          await c.query(
            "UPDATE agency_offline_conversions SET status=$2,warning_count=$3,error_count=$4,diagnostic_attempts=diagnostic_attempts+1,next_attempt_at=now()+least(3600,1800*power(1.3,diagnostic_attempts))*interval '1 second',updated_at=now() WHERE id=$1",
            [
              row.id,
              result.status === 'provider_accepted' && expired
                ? 'diagnostic_pending'
                : result.status,
              result.warnings,
              result.errors,
            ],
          );
        } else {
          const response = await send('https://datamanager.googleapis.com/v1/events:ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify(offlinePayload(row, config)),
            signal: AbortSignal.timeout(10000),
            redirect: 'error',
          });
          if (!response.ok) throw new Error('Ingestão HTTP ' + response.status);
          const data = (await response.json()) as { requestId?: string; fieldWarnings?: unknown[] };
          if (!row.validate_only && !data.requestId)
            throw new Error('Resposta sem identificador de processamento.');
          await c.query(
            "UPDATE agency_offline_conversions SET status=$2,request_id=$3,warning_count=$4,attempts=attempts+1,next_attempt_at=now()+interval '30 minutes',last_error=NULL,updated_at=now() WHERE id=$1",
            [
              row.id,
              row.validate_only ? 'validated' : 'provider_accepted',
              data.requestId ?? null,
              data.fieldWarnings?.length ?? 0,
            ],
          );
        }
        processed++;
      } catch (e) {
        const message = (e as Error).message,
          safe = /^(OAuth|Diagnóstico|Ingestão) HTTP \d{3}$/.test(message)
            ? message
            : 'Falha de comunicação com o Google.',
          permanent = /HTTP (400|401|403)/.test(message);
        await c.query(
          "UPDATE agency_offline_conversions SET status=CASE WHEN $3 OR attempts>=4 THEN 'failed' ELSE status END,attempts=attempts+1,diagnostic_attempts=CASE WHEN status='provider_accepted' THEN diagnostic_attempts+1 ELSE diagnostic_attempts END,next_attempt_at=now()+least(3600,60*power(2,attempts))*interval '1 second',last_error=$2,updated_at=now() WHERE id=$1",
          [row.id, safe, permanent],
        );
      }
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  return { configured: true, processed };
}
