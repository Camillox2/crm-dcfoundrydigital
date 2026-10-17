import { it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CalendarInput, groundedMeeting } from '../apps/api/src/calendar.js';
import { testDatabase } from './helpers/database.js';
import { buildApiServer } from '../apps/api/src/app.js';
import { signAccessToken } from '../apps/api/src/plugins/auth.js';
import type { WhatsAppEvent } from '@dcfoundry/shared';
it('requires an explicitly requested future meeting and rejects fabricated or negative dates', () => {
  const now = Date.parse('2026-10-17T12:00:00Z'),
    iso = '2026-10-20T10:00:00-03:00';
  expect(groundedMeeting('Quero agendar uma reunião em 20/10/2026 às 10:00', iso, now)).toBe(true);
  expect(groundedMeeting('Quero uma reunião', iso, now)).toBe(false);
  expect(groundedMeeting('Não quero agendar em 20/10/2026 às 10:00', iso, now)).toBe(false);
  expect(groundedMeeting('Quero agendar ' + iso, iso, Date.parse('2026-11-01'))).toBe(false);
  expect(
    CalendarInput.safeParse({
      title: 'Reunião teste',
      kind: 'meeting',
      startsAt: iso,
      endsAt: '2026-10-20T09:30:00-03:00',
    }).success,
  ).toBe(false);
});
it('reserves scoped calendar events, prevents overlaps and lets mocked Foundry book only after persistence', async () => {
  const db = await testDatabase(),
    owner = randomUUID(),
    other = randomUUID();
  await db.pool.query(
    "INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'owner@calendar.test','Owner','hash'),($2,'other@calendar.test','Other','hash')",
    [owner, other],
  );
  const date = new Date(Date.now() + 3 * 86400000);
  date.setUTCHours(14, 0, 0, 0);
  while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
  let meeting = date.toISOString();
  const generate = vi.fn(async () => ({
    answer: JSON.stringify({
      answer: 'Vou conferir o horário solicitado.',
      facts: {},
      meetingRequest: meeting,
    }),
    model: 'mock',
  }));
  const { app, whatsapp } = await buildApiServer({
    testDatabase: db,
    foundryGenerate: generate,
    whatsappTransport: { publish: async () => {}, close: async () => {} },
  });
  const auth = (id: string, role: 'admin' | 'vendedor' = 'admin') => ({
      authorization:
        'Bearer ' +
        signAccessToken({
          id,
          email: id + '@test.dev',
          fullName: 'Test',
          roles: [role],
          teamId: null,
          totpEnabled: false,
        }),
    }),
    headers = auth(owner);
  const call = (method: any, url: string, payload?: any, h = headers) =>
    app.inject({ method, url, payload, headers: h });
  try {
    expect(
      (
        await call('PUT', '/api/v1/calendar/settings', {
          enabled: true,
          weekdays: [1, 2, 3, 4, 5],
          startHour: 9,
          endHour: 18,
          durationMinutes: 30,
          version: 0,
        })
      ).statusCode,
    ).toBe(200);
    const data = {
      title: 'Reunião de teste',
      kind: 'meeting',
      startsAt: date.toISOString(),
      endsAt: new Date(date.getTime() + 1800000).toISOString(),
    };
    const created = await call('POST', '/api/v1/calendar', data);
    expect(created.statusCode, created.body).toBe(201);
    const event = created.json().item;
    expect((await call('POST', '/api/v1/calendar', data)).statusCode).toBe(409);
    expect(
      (
        await call(
          'PUT',
          '/api/v1/calendar/' + event.id,
          { ...data, version: 1 },
          auth(other, 'vendedor'),
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await call('PUT', '/api/v1/calendar/' + event.id, { ...data, version: 2 })).statusCode,
    ).toBe(409);
    expect(
      (
        await call('PUT', '/api/v1/calendar/' + event.id, {
          ...data,
          status: 'cancelled',
          version: 1,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await db.pool.query('SELECT * FROM calendar_event_versions WHERE event_id=$1', [event.id]))
        .rows,
    ).toHaveLength(1);
    await call('PUT', '/api/v1/foundry/settings', { whatsappEnabled: true, version: 1 });
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
    const inbound = (id: string, text: string): WhatsAppEvent => ({
      id: randomUUID(),
      sessionId,
      generation: 1,
      type: 'messages',
      messages: [
        {
          externalId: id,
          jid: '5541999999977@s.whatsapp.net',
          phone: '+5541999999977',
          name: 'Lead agenda',
          text,
          fromMe: false,
          historical: false,
          timestamp: new Date().toISOString(),
          type: 'text',
        },
      ],
    });
    const raw = inbound('meeting-1', 'Quero agendar uma reunião em ' + meeting);
    await whatsapp.processEvent(raw);
    await whatsapp.processEvent(raw);
    const booked = (await db.pool.query("SELECT * FROM calendar_events WHERE source='foundry'"))
      .rows;
    expect(booked).toHaveLength(1);
    expect(
      (
        await db.pool.query(
          "SELECT body FROM wa_messages WHERE actor_type='foundry' ORDER BY created_at DESC LIMIT 1",
        )
      ).rows[0].body,
    ).toContain('Reunião agendada');
    await whatsapp.processEvent(inbound('meeting-2', 'Quero agendar uma reunião em ' + meeting));
    expect(
      (
        await db.pool.query(
          "SELECT body FROM wa_messages WHERE actor_type='foundry' ORDER BY created_at DESC LIMIT 1",
        )
      ).rows[0].body,
    ).toContain('ocupado');
    meeting = new Date(date.getTime() + 3600000).toISOString();
    await whatsapp.processEvent(inbound('meeting-3', 'Quero conversar sobre um site'));
    expect(
      (await db.pool.query("SELECT * FROM calendar_events WHERE source='foundry'")).rows,
    ).toHaveLength(1);
    const from = new Date(date.getTime() - 86400000).toISOString(),
      to = new Date(date.getTime() + 86400000).toISOString(),
      path = '/api/v1/calendar?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to);
    expect((await call('GET', path, undefined, auth(other, 'vendedor'))).json().items).toHaveLength(
      0,
    );
  } finally {
    await app.close();
    await db.pool.end();
  }
}, 30000);
