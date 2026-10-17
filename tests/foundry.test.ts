import { it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { groundedFacts, parseFoundryTurn } from '@dcfoundry/ai';
import type { WhatsAppEvent, WhatsAppCommand } from '@dcfoundry/shared';
import { askGemini } from '../apps/api/src/assistant-provider.js';
import { testDatabase } from './helpers/database.js';
import { buildApiServer } from '../apps/api/src/app.js';
import { signAccessToken } from '../apps/api/src/plugins/auth.js';
import { ModuleStore } from '../apps/api/src/module-store.js';
it('retains only evidenced qualification facts and rejects invented prices and promises', () => {
  expect(
    groundedFacts('Quero um site e tenho orçamento de R$ 3.000.', {
      projectType: { value: 'site', evidence: 'site' },
      budgetCents: { value: 300000, evidence: 'orçamento de R$ 3.000.' },
      decisionMaker: { value: 'Diretor', evidence: 'Eu sou o Diretor' },
    }),
  ).toEqual({ projectType: 'site', budgetCents: 300000 });
  expect(
    groundedFacts('Quero um site', { budgetCents: { value: 999900, evidence: 'site' } }),
  ).toEqual({});
  expect(
    parseFoundryTurn(
      JSON.stringify({
        answer: 'Custa R$ 999,00 e o retorno é garantido.',
        handoff: false,
        facts: {},
      }),
      'Quanto custa?',
      'Criamos sites.',
    ).handoff,
  ).toBe(true);
  const unparsed = parseFoundryTurn('not JSON', 'Olá', '');
  expect(unparsed.handoff).toBe(false);
  expect(unparsed.answer.length).toBeGreaterThan(10);
  expect(
    parseFoundryTurn(
      'Claro. {"answer":"Qual é o prazo do projeto?","handoff":false,"facts":{}}',
      'Quero um site',
      '',
    ),
  ).toMatchObject({ handoff: false, answer: 'Qual é o prazo do projeto?' });
  expect(parseFoundryTurn('', 'Quero uma pessoa de verdade', '').handoff).toBe(true);
});
it('tries up to ten configured Gemini models with the provider mocked', async () => {
  const before = { key: process.env.GEMINI_API_KEY, models: process.env.GEMINI_MODELS };
  process.env.GEMINI_API_KEY = 'test-only-provider-key';
  process.env.GEMINI_MODELS = Array.from({ length: 12 }, (_, n) => `flash-test-${n + 1}`).join(',');
  try {
    let calls = 0;
    const send = vi.fn(async () =>
      ++calls < 10
        ? new Response('{}', { status: 429 })
        : Response.json({
            candidates: [
              { finishReason: 'STOP', content: { parts: [{ text: 'Resposta confirmada' }] } },
            ],
          }),
    );
    const result = await askGemini('Olá', 'Contexto', send as typeof fetch);
    expect(send).toHaveBeenCalledTimes(10);
    expect(result.model).toBe('flash-test-10');
    expect(result.answer).toBe('Resposta confirmada');
  } finally {
    if (before.key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = before.key;
    if (before.models === undefined) delete process.env.GEMINI_MODELS;
    else process.env.GEMINI_MODELS = before.models;
  }
});
it('shares knowledge, qualifies, hands off, cancels an in-flight reply and isolates the lab', async () => {
  const db = await testDatabase(),
    owner = randomUUID(),
    other = randomUUID();
  await db.pool.query(
    `INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'owner@foundry.example','Owner','hash'),($2,'other@foundry.example','Other','hash')`,
    [owner, other],
  );
  let unblock!: () => void, started!: () => void;
  const gate = new Promise<void>((done) => {
      unblock = done;
    }),
    began = new Promise<void>((done) => {
      started = done;
    });
  const generate = vi.fn(async (message: string, context: string) => {
    if (message.includes('pausa no meio')) {
      started();
      await gate;
    }
    if (!context.includes('Retorne SOMENTE JSON'))
      return { answer: 'Resumo com os fatos confirmados da conversa.', model: 'mock-gemini' };
    return {
      answer: JSON.stringify({
        answer: 'Entendi. Qual é o prazo desejado para o projeto?',
        handoff: false,
        facts: message.includes('3.000')
          ? {
              projectType: { value: 'site', evidence: 'site' },
              budgetCents: { value: 300000, evidence: 'R$ 3.000' },
            }
          : {},
      }),
      model: 'mock-gemini',
    };
  });
  const published: WhatsAppCommand[] = [],
    controls: unknown[] = [];
  const { app, whatsapp } = await buildApiServer({
    testDatabase: db,
    foundryGenerate: generate,
    whatsappTransport: {
      publish: async (command) => {
        published.push(command);
      },
      control: async (...values) => {
        controls.push(values);
      },
      close: async () => {},
    },
  });
  const token = (id: string, role: 'admin' | 'vendedor') => ({
    authorization: `Bearer ${signAccessToken({ id, email: id + '@foundry.example', fullName: 'Test', roles: [role], teamId: null, totpEnabled: false })}`,
  });
  const headers = token(owner, 'admin'),
    actor = { id: owner, teamId: null, scope: 'all' as const },
    modules = new ModuleStore(db.pool);
  try {
    const knowledge = await modules.save(
      'knowledge',
      actor,
      {
        title: 'Método da agência',
        category: 'Empresa',
        content: 'Trabalhamos em etapas com validação do cliente.',
        audience: 'public',
      },
      null,
    );
    await modules.save(
      'knowledge',
      actor,
      {
        title: 'Método da agência',
        category: 'Empresa',
        content:
          'Trabalhamos em etapas com validação do cliente. Código e design são construídos juntos.',
        audience: 'public',
      },
      null,
      knowledge.id,
      knowledge.version,
    );
    expect(await modules.versions(knowledge.id, 'knowledge', actor)).toHaveLength(1);
    expect(
      (await db.pool.query("SELECT * FROM workspace_documents WHERE kind='knowledge'")).rows,
    ).toHaveLength(0);
    await modules.save(
      'assistant',
      actor,
      {
        title: 'Foundry',
        instructions: 'Faça uma pergunta por vez e fale com clareza.',
        tone: 'friendly',
      },
      null,
    );
    const enabled = await app.inject({
      method: 'PUT',
      url: '/api/v1/foundry/settings',
      headers,
      payload: { whatsappEnabled: true, version: 1 },
    });
    expect(enabled.statusCode, enabled.body).toBe(200);
    const sessionId = await (
      await whatsapp.store()
    ).connect(actor, { provider: 'baileys', importHistory: false });
    await whatsapp.processEvent({
      id: randomUUID(),
      sessionId,
      generation: 1,
      type: 'status',
      status: 'connected',
    });
    const inbound = (externalId: string, text: string): WhatsAppEvent => ({
      id: randomUUID(),
      sessionId,
      generation: 1,
      type: 'messages',
      messages: [
        {
          externalId,
          jid: '5541999999999@s.whatsapp.net',
          phone: '+5541999999999',
          name: 'Contato de teste',
          text,
          fromMe: false,
          historical: false,
          timestamp: new Date().toISOString(),
          type: 'text',
        },
      ],
    });
    const first = inbound('qualify-1', 'Quero um site. Tenho R$ 3.000 de orçamento.');
    await whatsapp.processEvent(first);
    await whatsapp.processEvent(first);
    const lead = (await db.pool.query('SELECT * FROM workspace_leads')).rows[0];
    expect(lead.project_type).toBe('site');
    expect(Number(lead.budget_cents)).toBe(300000);
    expect(
      (await db.pool.query("SELECT * FROM wa_messages WHERE actor_type='foundry'")).rows,
    ).toHaveLength(1);
    expect(generate.mock.calls[0]![1]).toContain('Trabalhamos em etapas');
    expect(generate.mock.calls[0]![1]).toContain('Faça uma pergunta por vez');
    await whatsapp.processEvent(inbound('human-1', 'Quero falar com uma pessoa de verdade.'));
    expect(
      (await db.pool.query('SELECT ai_paused FROM workspace_leads WHERE id=$1', [lead.id])).rows[0]
        .ai_paused,
    ).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
    await whatsapp.processEvent(inbound('paused-1', 'Oi de novo'));
    expect(generate).toHaveBeenCalledTimes(1);
    const state = (await app.inject({ url: `/api/v1/leads/${lead.id}/foundry`, headers })).json();
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/v1/leads/${lead.id}/foundry`,
          headers,
          payload: { paused: false, revision: 1 },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/v1/leads/${lead.id}/foundry`,
          headers,
          payload: { paused: false, revision: state.revision },
        })
      ).statusCode,
    ).toBe(200);
    const inFlight = whatsapp.processEvent(inbound('race-1', 'Teste pausa no meio'));
    await began;
    const revision = (
      await db.pool.query('SELECT ai_control_revision FROM workspace_leads WHERE id=$1', [lead.id])
    ).rows[0].ai_control_revision;
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/v1/leads/${lead.id}/foundry`,
          headers,
          payload: { paused: true, revision },
        })
      ).statusCode,
    ).toBe(200);
    unblock();
    await inFlight;
    expect(
      (await db.pool.query("SELECT count(*) AS n FROM foundry_turns WHERE state='cancelled'"))
        .rows[0].n,
    ).toBe(1);
    expect(controls.length).toBeGreaterThan(0);
    const before = (await db.pool.query('SELECT count(*) AS n FROM workspace_leads')).rows[0].n;
    const lab = await app.inject({
      method: 'POST',
      url: '/api/v1/foundry/lab/run',
      headers,
      payload: { scenario: 'human' },
    });
    expect(lab.statusCode).toBe(200);
    expect(lab.json().passed).toBe(true);
    expect((await db.pool.query('SELECT count(*) AS n FROM workspace_leads')).rows[0].n).toBe(
      before,
    );
    const internal = await app.inject({
      method: 'POST',
      url: '/api/v1/workspace/assistant-chat',
      headers,
      payload: { message: 'Ajude a equipe com o briefing' },
    });
    expect(internal.statusCode, internal.body).toBe(200);
    expect(generate.mock.calls.at(-1)![1]).toContain('Trabalhamos em etapas');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/leads/${lead.id}/ai-summary`,
          headers: token(other, 'vendedor'),
        })
      ).statusCode,
    ).toBe(404);
    const summary = await app.inject({
      method: 'POST',
      url: `/api/v1/leads/${lead.id}/ai-summary`,
      headers,
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().answer).toContain('fatos confirmados');
  } finally {
    unblock();
    await app.close();
    await db.pool.end();
  }
}, 30000);
