import { it, expect, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers/database.js';
import { buildApiServer } from '../apps/api/src/app.js';
import { signAccessToken } from '../apps/api/src/plugins/auth.js';
import { humanResponseSla } from '../apps/api/src/human-sla.js';
it('measures human response cycles, ignoring Foundry, queued/failed sends and history', () => {
  const now = Date.parse('2026-10-17T12:30:00Z'),
    base = {
      lead_id: 'lead',
      channel: 'whatsapp',
      sla_minutes: 10,
      delivery: 'received',
      actor_type: 'contact',
      direction: 'inbound',
      sent_at: '2026-10-17T12:00:00Z',
    };
  const messages = [
    base,
    {
      ...base,
      direction: 'outbound',
      actor_type: 'foundry',
      delivery: 'sent',
      sent_at: '2026-10-17T12:01:00Z',
    },
    {
      ...base,
      direction: 'outbound',
      actor_type: 'human',
      delivery: 'queued',
      sent_at: '2026-10-17T12:02:00Z',
    },
    {
      ...base,
      direction: 'outbound',
      actor_type: 'human',
      delivery: 'failed',
      sent_at: '2026-10-17T12:03:00Z',
    },
  ];
  expect(humanResponseSla(messages, now)).toMatchObject({ answered: 0, awaiting: 1, overdue: 1 });
  messages.push({
    ...base,
    direction: 'outbound',
    actor_type: 'human',
    delivery: 'sent',
    sent_at: '2026-10-17T12:08:00Z',
  });
  expect(humanResponseSla(messages, now)).toMatchObject({
    answered: 1,
    awaiting: 0,
    withinSla: 1,
    medianMinutes: 8,
  });
  expect(humanResponseSla([{ ...base, historical: true }], now).awaiting).toBe(0);
});
it('creates an anonymous scoped lead, shares Foundry knowledge and lets a real human take over the site chat', async () => {
  const env = { key: process.env.CRM_SITE_INGEST_TOKEN, owner: process.env.CRM_SITE_OWNER_ID },
    owner = randomUUID(),
    other = randomUUID();
  process.env.CRM_SITE_OWNER_ID = owner;
  process.env.CRM_SITE_INGEST_TOKEN = randomBytes(32).toString('hex');
  const db = await testDatabase();
  await db.pool.query(
    "INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'owner@webchat.test','Owner','hash'),($2,'other@webchat.test','Other','hash')",
    [owner, other],
  );
  const generate = vi.fn(async (message: string, context: string) => ({
    answer: JSON.stringify({
      answer: 'Qual é o objetivo principal desse site?',
      facts: { projectType: { value: 'site', evidence: 'site' } },
    }),
    model: 'mock',
  }));
  const { app } = await buildApiServer({ testDatabase: db, foundryGenerate: generate });
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
    headers = auth(owner),
    bridge = { authorization: 'Bearer ' + process.env.CRM_SITE_INGEST_TOKEN },
    call = (method: any, url: string, payload?: any, h = headers) =>
      app.inject({ method, url, payload, headers: h });
  try {
    await call('POST', '/api/v1/workspace/knowledge', {
      data: {
        title: 'Base compartilhada de teste',
        content: 'Criamos interfaces com validação de etapas pelo cliente.',
        category: 'Serviços',
        audience: 'public',
      },
    });
    expect(
      (
        await call('PUT', '/api/v1/foundry/settings', {
          whatsappEnabled: false,
          websiteEnabled: true,
          version: 1,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await call('POST', '/api/public/website-chat/sessions', { visitorHash: 'a'.repeat(64) }, {}))
        .statusCode,
    ).toBe(401);
    const created = await call(
      'POST',
      '/api/public/website-chat/sessions',
      { visitorHash: 'a'.repeat(64), path: '/sites-curitiba' },
      bridge,
    );
    expect(created.statusCode, created.body).toBe(201);
    const token = created.json().token,
      base = '/api/public/website-chat/sessions/' + token,
      id = randomUUID();
    const received = await call(
      'POST',
      base + '/messages',
      { id, message: 'Quero um site' },
      bridge,
    );
    expect(received.statusCode, received.body).toBe(200);
    expect(received.json().messages.map((m: any) => m.role)).toEqual(['contact', 'foundry']);
    expect(generate.mock.calls[0]![1]).toContain('Criamos interfaces');
    await call('POST', base + '/messages', { id, message: 'Quero um site' }, bridge);
    expect(generate).toHaveBeenCalledTimes(1);
    const lead = (await db.pool.query('SELECT * FROM workspace_leads')).rows[0];
    expect(lead.phone).toBe('');
    expect(lead.project_type).toBe('site');
    const session = (await call('GET', '/api/v1/website-chat')).json().items[0];
    expect(
      (await call('GET', '/api/v1/website-chat', undefined, auth(other, 'vendedor'))).json().items,
    ).toHaveLength(0);
    expect(
      (
        await call(
          'POST',
          '/api/v1/website-chat/' + session.id + '/messages',
          { id: randomUUID(), message: 'Olá, sou da equipe.' },
          auth(other, 'vendedor'),
        )
      ).statusCode,
    ).toBe(404);
    expect((await call('GET', '/api/v1/reports/human-sla')).json()).toMatchObject({
      answered: 0,
      awaiting: 1,
    });
    const human = await call('POST', '/api/v1/website-chat/' + session.id + '/messages', {
      id: randomUUID(),
      message: 'Olá, sou da equipe.',
    });
    expect(human.statusCode, human.body).toBe(201);
    expect((await call('GET', base, undefined, bridge)).json().messages.at(-1)).toMatchObject({
      role: 'human',
      body: 'Olá, sou da equipe.',
    });
    expect((await call('GET', '/api/v1/reports/human-sla')).json()).toMatchObject({
      answered: 1,
      awaiting: 0,
    });
    expect(
      (await db.pool.query('SELECT ai_paused FROM workspace_leads WHERE id=$1', [lead.id])).rows[0]
        .ai_paused,
    ).toBe(true);
    await call(
      'POST',
      base + '/messages',
      { id: randomUUID(), message: 'Certo, obrigado' },
      bridge,
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect((await call('GET', '/api/v1/reports/human-sla')).json()).toMatchObject({
      answered: 1,
      awaiting: 1,
    });
    await call('DELETE', base, undefined, bridge);
    expect((await call('GET', base, undefined, bridge)).statusCode).toBe(404);
  } finally {
    await app.close();
    await db.pool.end();
    for (const [name, value] of [
      ['CRM_SITE_INGEST_TOKEN', env.key],
      ['CRM_SITE_OWNER_ID', env.owner],
    ]) {
      if (value === undefined) delete process.env[name!];
      else process.env[name!] = value;
    }
  }
}, 30000);
