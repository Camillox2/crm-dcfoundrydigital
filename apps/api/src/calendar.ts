import { z } from 'zod';
import type { CrmPool } from './agency-access.js';
import { WorkspaceError } from './module-store.js';
export const CalendarInput = z
  .object({
    title: z.string().trim().min(3).max(180),
    kind: z.enum(['meeting', 'followup', 'event']),
    description: z.string().trim().max(10000).default(''),
    leadId: z.string().uuid().nullable().default(null),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    meetingUrl: z
      .union([
        z
          .string()
          .url()
          .refine((v) => v.startsWith('https://')),
        z.literal(''),
      ])
      .default(''),
    status: z.enum(['scheduled', 'completed', 'cancelled']).default('scheduled'),
    version: z.number().int().positive().optional(),
  })
  .refine(
    (v) =>
      Date.parse(v.endsAt) > Date.parse(v.startsAt) &&
      Date.parse(v.endsAt) - Date.parse(v.startsAt) <= 86400000,
    { message: 'O compromisso deve durar de um minuto a 24 horas.' },
  );
export const CalendarSettingsInput = z
  .object({
    enabled: z.boolean(),
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((v) => new Set(v).size === v.length),
    startHour: z.number().int().min(0).max(22),
    endHour: z.number().int().min(1).max(23),
    durationMinutes: z.number().int().min(15).max(120),
    version: z.number().int().min(0),
  })
  .refine((v) => v.endHour > v.startHour);
type Query = Pick<CrmPool, 'query'>;
export function groundedMeeting(input: string, iso: string, now = Date.now()) {
  const date = new Date(iso),
    ms = date.getTime();
  if (
    !Number.isFinite(ms) ||
    ms <= now ||
    ms > now + 180 * 86400000 ||
    !/reuni[aã]o|agendar|agende|marcar/i.test(input) ||
    /n[aã]o (quero|posso)|cancelar/i.test(input)
  )
    return false;
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (key: string) => parts.find((p) => p.type === key)?.value;
  return (
    input.includes(iso) ||
    (input.includes(get('day') + '/' + get('month') + '/' + get('year')) &&
      (input.includes(get('hour') + ':' + get('minute')) ||
        input.includes(get('hour') + 'h' + get('minute'))))
  );
}
export async function calendarConflict(
  client: Query,
  owner: string,
  start: string,
  end: string,
  exclude: string | null = null,
) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['calendar:' + owner]);
  return (
    (
      await client.query(
        "SELECT id FROM calendar_events WHERE owner_id=$1 AND status='scheduled' AND starts_at<$3::timestamptz AND ends_at>$2::timestamptz AND ($4::uuid IS NULL OR id<>$4) LIMIT 1",
        [owner, start, end, exclude],
      )
    ).rows.length > 0
  );
}
export async function bookFoundryMeeting(
  client: Query,
  lead: { id: string; owner_id: string; name: string },
  iso: string,
  input: string,
  key: string,
) {
  if (!groundedMeeting(input, iso))
    return {
      answer:
        'Para consultar a agenda, informe a data completa (DD/MM/AAAA) e o horário, no fuso de Brasília.',
    };
  const settings = (
    await client.query('SELECT * FROM calendar_settings WHERE owner_id=$1', [lead.owner_id])
  ).rows[0];
  if (!settings?.enabled)
    return {
      answer:
        'Vou pedir à equipe para confirmar uma data com você. A agenda automática ainda não está habilitada.',
      handoff: true,
    };
  const start = new Date(iso),
    end = new Date(start.getTime() + settings.duration_minutes * 60000),
    local = new Date(start.getTime() - 3 * 3600000),
    endLocal = new Date(end.getTime() - 3 * 3600000);
  if (
    !settings.weekdays.includes(local.getUTCDay()) ||
    local.getUTCHours() < settings.start_hour ||
    endLocal.getUTCHours() + endLocal.getUTCMinutes() / 60 > settings.end_hour ||
    local.getUTCDate() !== endLocal.getUTCDate()
  )
    return {
      answer:
        'Esse horário está fora dos períodos de atendimento configurados. Pode informar outra data e horário?',
    };
  const existing = (await client.query('SELECT id FROM calendar_events WHERE source_key=$1', [key]))
    .rows[0];
  if (
    !existing &&
    (await calendarConflict(client, lead.owner_id, start.toISOString(), end.toISOString()))
  )
    return {
      answer: 'Esse horário já está ocupado. Qual outra data e horário funcionam para você?',
    };
  const row =
    existing ??
    (
      await client.query(
        "INSERT INTO calendar_events(owner_id,lead_id,title,kind,starts_at,ends_at,source,source_key) VALUES($1,$2,$3,'meeting',$4,$5,'foundry',$6) RETURNING id",
        [
          lead.owner_id,
          lead.id,
          'Reunião com ' + lead.name,
          start.toISOString(),
          end.toISOString(),
          key,
        ],
      )
    ).rows[0];
  await client.query(
    "INSERT INTO audit_logs(actor_type,action,entity_type,entity_id,diff_json) VALUES('ai_agent','calendar.booked','calendar_event',$1,$2)",
    [row.id, JSON.stringify({ leadId: lead.id, startsAt: start.toISOString() })],
  );
  return {
    id: row.id,
    answer:
      'Reunião agendada para ' +
      start.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      }) +
      ' (horário de Brasília). A equipe confirma o canal de reunião com você.',
  };
}
export async function saveCalendar(
  client: Query,
  actor: string,
  owner: string,
  body: unknown,
  id?: string,
) {
  const input = CalendarInput.parse(body),
    previous = id
      ? (
          await client.query(
            'SELECT * FROM calendar_events WHERE id=$1 AND owner_id=$2 FOR UPDATE',
            [id, owner],
          )
        ).rows[0]
      : null;
  if (id && !previous) throw new WorkspaceError(404, 'Compromisso indisponível.');
  if (previous && input.version !== previous.version)
    throw new WorkspaceError(409, 'O compromisso mudou. Atualize a agenda.');
  if (
    input.status === 'scheduled' &&
    (await calendarConflict(client, owner, input.startsAt, input.endsAt, id ?? null))
  )
    throw new WorkspaceError(409, 'Existe outro compromisso nesse horário.');
  if (previous)
    await client.query(
      'INSERT INTO calendar_event_versions(event_id,version,title,kind,description,starts_at,ends_at,meeting_url,status,lead_id,actor_id) SELECT id,version,title,kind,description,starts_at,ends_at,meeting_url,status,lead_id,$2 FROM calendar_events WHERE id=$1',
      [id, actor],
    );
  const args = [
    input.title,
    input.kind,
    input.description,
    input.startsAt,
    input.endsAt,
    input.meetingUrl,
    input.status,
    input.leadId,
  ];
  const row = previous
    ? (
        await client.query(
          'UPDATE calendar_events SET title=$2,kind=$3,description=$4,starts_at=$5,ends_at=$6,meeting_url=$7,status=$8,lead_id=$9,version=version+1,updated_at=now() WHERE id=$1 RETURNING *',
          [id, ...args],
        )
      ).rows[0]
    : (
        await client.query(
          'INSERT INTO calendar_events(owner_id,title,kind,description,starts_at,ends_at,meeting_url,status,lead_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
          [owner, ...args],
        )
      ).rows[0];
  await client.query(
    "INSERT INTO audit_logs(actor_type,actor_id,action,entity_type,entity_id,diff_json) VALUES('user',$1,'calendar.save','calendar_event',$2,$3)",
    [actor, row.id, JSON.stringify({ version: row.version, status: row.status })],
  );
  return row;
}
