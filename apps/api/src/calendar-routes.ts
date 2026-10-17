import type { FastifyInstance } from 'fastify';
import type { DatabaseConnectionResult } from '@dcfoundry/db';
import { z } from 'zod';
import { requirePermission } from './plugins/auth.js';
import { requestActor, scopedLead } from './agency-access.js';
import { WorkspaceError } from './module-store.js';
import { CalendarInput, CalendarSettingsInput, saveCalendar } from './calendar.js';
export async function registerCalendarRoutes(
  app: FastifyInstance,
  database: () => Promise<DatabaseConnectionResult> | null,
) {
  const pool = async () => {
    const db = await database();
    if (!db) throw new WorkspaceError(503, 'Configure o PostgreSQL.');
    return db.pool;
  };
  const accessible = async (req: any, id: string, permission: 'task:read' | 'task:update') => {
    const a = requestActor(req, permission),
      row = (
        await (
          await pool()
        ).query(
          'SELECT e.* FROM calendar_events e LEFT JOIN users u ON u.id=e.owner_id WHERE e.id=$1 AND ($2::boolean OR e.owner_id=$3 OR ($4::boolean AND u.team_id=$5))',
          [id, a.scope === 'all', a.id, a.scope === 'team', a.teamId],
        )
      ).rows[0];
    if (!row) throw new WorkspaceError(404, 'Compromisso indisponível.');
    if (row.lead_id) await scopedLead(await pool(), req, row.lead_id);
    return row;
  };
  app.get('/api/v1/calendar', { preHandler: [requirePermission('task:read')] }, async (req) => {
    const range = z
        .object({
          from: z.string().datetime({ offset: true }),
          to: z.string().datetime({ offset: true }),
        })
        .refine(
          (v) =>
            Date.parse(v.to) > Date.parse(v.from) &&
            Date.parse(v.to) - Date.parse(v.from) <= 100 * 86400000,
        )
        .parse(req.query),
      a = requestActor(req, 'task:read'),
      leadScope = requestActor(req, 'lead:read');
    const items = (
      await (
        await pool()
      ).query(
        'SELECT e.* FROM calendar_events e LEFT JOIN users u ON u.id=e.owner_id LEFT JOIN workspace_leads l ON l.id=e.lead_id LEFT JOIN users lu ON lu.id=l.owner_id WHERE e.starts_at<$1 AND e.ends_at>$2 AND ($3::boolean OR e.owner_id=$4 OR ($5::boolean AND u.team_id=$6)) AND (e.lead_id IS NULL OR ($7::boolean OR l.owner_id=$4 OR ($8::boolean AND lu.team_id=$9))) ORDER BY e.starts_at LIMIT 500',
        [
          range.to,
          range.from,
          a.scope === 'all',
          a.id,
          a.scope === 'team',
          a.teamId,
          leadScope.scope === 'all',
          leadScope.scope === 'team',
          leadScope.teamId,
        ],
      )
    ).rows;
    return { items };
  });
  for (const method of ['POST', 'PUT'] as const)
    app.route({
      method,
      url: '/api/v1/calendar' + (method === 'PUT' ? '/:id' : ''),
      preHandler: [requirePermission(method === 'POST' ? 'task:create' : 'task:update')],
      handler: async (req, reply) => {
        const input = CalendarInput.parse(req.body),
          p = await pool(),
          id =
            method === 'PUT'
              ? z
                  .string()
                  .uuid()
                  .parse((req.params as any).id)
              : undefined;
        const previous = id ? await accessible(req, id, 'task:update') : null;
        if (input.leadId) {
          await scopedLead(p, req, input.leadId);
          await scopedLead(p, req, input.leadId, method === 'POST' ? 'task:create' : 'task:update');
        }
        const c = await p.connect();
        try {
          await c.query('BEGIN');
          const row = await saveCalendar(
            c,
            req.authUser!.id,
            previous?.owner_id ?? req.authUser!.id,
            input,
            id,
          );
          await c.query('COMMIT');
          return reply.code(method === 'POST' ? 201 : 200).send({ item: row });
        } catch (e) {
          await c.query('ROLLBACK');
          throw e;
        } finally {
          c.release();
        }
      },
    });
  app.get(
    '/api/v1/calendar/settings',
    { preHandler: [requirePermission('task:read')] },
    async (req) => ({
      item:
        (
          await (
            await pool()
          ).query('SELECT * FROM calendar_settings WHERE owner_id=$1', [req.authUser!.id])
        ).rows[0] ?? null,
    }),
  );
  app.put(
    '/api/v1/calendar/settings',
    { preHandler: [requirePermission('task:update')] },
    async (req) => {
      const v = CalendarSettingsInput.parse(req.body),
        c = await (await pool()).connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          'calendar:' + req.authUser!.id,
        ]);
        const old = (
          await c.query('SELECT version FROM calendar_settings WHERE owner_id=$1', [
            req.authUser!.id,
          ])
        ).rows[0];
        if ((old?.version ?? 0) !== v.version)
          throw new WorkspaceError(409, 'A configuração mudou.');
        const row = (
          await c.query(
            'INSERT INTO calendar_settings(owner_id,enabled,weekdays,start_hour,end_hour,duration_minutes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(owner_id) DO UPDATE SET enabled=EXCLUDED.enabled,weekdays=EXCLUDED.weekdays,start_hour=EXCLUDED.start_hour,end_hour=EXCLUDED.end_hour,duration_minutes=EXCLUDED.duration_minutes,version=calendar_settings.version+1 RETURNING *',
            [req.authUser!.id, v.enabled, v.weekdays, v.startHour, v.endHour, v.durationMinutes],
          )
        ).rows[0];
        await c.query(
          "INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1::uuid,'calendar.settings','calendar_settings',$1::text,$2)",
          [req.authUser!.id, JSON.stringify({ enabled: v.enabled, version: row.version })],
        );
        await c.query('COMMIT');
        return { item: row };
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
  );
}
