import type { DatabaseConnectionResult } from '@dcfoundry/db';
import type { AiAttempt } from './assistant-provider.js';

type Pool = DatabaseConnectionResult['pool'];
const ZONE = 'America/Sao_Paulo';

/** Best effort: usage tracking never blocks or fails a chat answer. */
export function recordAiAttempt(pool: Pool, actorId: string | null, attempt: AiAttempt) {
  pool
    .query(
      'INSERT INTO ai_usage_events(model,outcome,http_status,latency_ms,fallback_position,prompt_tokens,output_tokens,total_tokens,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        attempt.model.slice(0, 120),
        attempt.outcome,
        attempt.httpStatus,
        Math.max(0, Math.round(attempt.latencyMs)),
        attempt.fallbackPosition,
        attempt.promptTokens,
        attempt.outputTokens,
        attempt.totalTokens,
        actorId,
      ],
    )
    .catch(() => {});
}

export async function aiUsageSummary(pool: Pool, days: 7 | 30) {
  const since = `now() - make_interval(days => $1::int)`;
  const [models, daily, totals] = await Promise.all([
    pool.query(
      `SELECT model, count(*)::int AS calls,
        count(*) FILTER (WHERE outcome='success')::int AS success,
        count(*) FILTER (WHERE outcome='quota')::int AS quota,
        count(*) FILTER (WHERE outcome='error')::int AS errors,
        coalesce(sum(total_tokens),0)::bigint AS tokens,
        round(avg(latency_ms))::int AS "avgLatencyMs",
        round(avg(fallback_position)::numeric,2)::float AS "avgFallbackPosition"
       FROM ai_usage_events WHERE created_at >= ${since}
       GROUP BY model ORDER BY calls DESC, model`,
      [days],
    ),
    pool.query(
      `SELECT to_char(d.day,'YYYY-MM-DD') AS date,
        count(e.id)::int AS calls,
        count(e.id) FILTER (WHERE e.outcome='success')::int AS success,
        count(e.id) FILTER (WHERE e.outcome='quota')::int AS quota,
        count(e.id) FILTER (WHERE e.outcome='error')::int AS errors,
        coalesce(sum(e.total_tokens),0)::bigint AS tokens
       FROM generate_series((now() AT TIME ZONE '${ZONE}')::date - ($1::int - 1), (now() AT TIME ZONE '${ZONE}')::date, interval '1 day') AS d(day)
       LEFT JOIN ai_usage_events e ON (e.created_at AT TIME ZONE '${ZONE}')::date = d.day::date
       GROUP BY d.day ORDER BY d.day`,
      [days],
    ),
    pool.query(
      `SELECT count(*)::int AS calls,
        count(*) FILTER (WHERE outcome='success')::int AS success,
        count(*) FILTER (WHERE outcome='quota')::int AS quota,
        count(*) FILTER (WHERE outcome='error')::int AS errors,
        coalesce(sum(total_tokens),0)::bigint AS tokens
       FROM ai_usage_events WHERE created_at >= ${since}`,
      [days],
    ),
  ]);
  const rate = (r: { calls: number; success: number }) =>
    r.calls ? Math.round((r.success / r.calls) * 1000) / 10 : 0;
  const num = <T extends { tokens: string | number }>(r: T) => ({ ...r, tokens: Number(r.tokens) });
  const total = num(totals.rows[0]);
  return {
    days,
    timeZone: ZONE,
    totals: { ...total, successRate: rate(total) },
    byModel: models.rows.map((r) => ({ ...num(r), successRate: rate(r) })),
    daily: daily.rows.map(num),
  };
}
