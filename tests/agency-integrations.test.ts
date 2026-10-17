import { it, expect, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { moduleSchemas, permittedAttribution } from '@dcfoundry/shared';
import { testDatabase } from './helpers/database.js';
import { buildApiServer } from '../apps/api/src/app.js';
import { signAccessToken } from '../apps/api/src/plugins/auth.js';
import { ModuleStore } from '../apps/api/src/module-store.js';
import { parseLeadCsv } from '../apps/api/src/lead-import.js';
import { flushOfflineAds, diagnosticResult } from '../apps/api/src/offline-ads.js';
it('parses quoted multiline CSV and blocks advertising identifiers when consent is missing or denied', () => {
  const rows = parseLeadCsv(
    'nome;empresa;telefone;notas\r\n"Ana; Silva";"Empresa ""Nova""";(41) 99999-9999;"Primeira linha\nSegunda linha"',
  );
  expect(rows[0]?.data).toMatchObject({
    name: 'Ana; Silva',
    company: 'Empresa "Nova"',
    phone: '+5541999999999',
    notes: 'Primeira linha\nSegunda linha',
  });
  expect(() => parseLeadCsv('nome;empresa;telefone\n"Aberto;Teste;41999999999')).toThrow('aspas');
  expect(() =>
    parseLeadCsv(
      'nome;empresa;telefone\n' +
        Array.from({ length: 501 }, () => 'Teste;Teste;41999999999').join('\n'),
    ),
  ).toThrow('500');
  expect(permittedAttribution({ gclid: 'sample-click', adConsent: 'denied' }).gclid).toBe('');
  expect(permittedAttribution({ gclid: 'sample-click' }).gclid).toBe('');
  expect(
    diagnosticResult({
      requestStatusPerDestination: [
        { requestStatus: 'PARTIAL_SUCCESS', errorInfo: { errorCounts: [{ recordCount: '1' }] } },
      ],
    }),
  ).toMatchObject({ status: 'partial_failure', errors: 1 });
});
it('migrates every legacy module and version to native columns without losing chat messages', async () => {
  const owner = randomUUID(),
    ids: Record<string, string> = {};
  const examples: Record<string, unknown> = {
    blog: {
      title: 'Artigo de migração',
      slug: 'artigo-migrado',
      content: 'Conteúdo para preservar na migração.',
      status: 'draft',
      tags: ['Software'],
    },
    invoice: {
      title: 'Parcela de migração',
      client: 'Cliente teste',
      amountCents: 12000,
      dueDate: '2026-12-30',
    },
    task: { title: 'Tarefa de migração' },
    template: { title: 'Modelo de mensagem', content: 'Olá, vamos conversar sobre seu projeto?' },
    campaign: {
      title: 'Métrica de migração',
      campaignId: 'test',
      account: 'test',
      date: '2026-10-17',
      costCents: 1234,
      impressions: 100,
      clicks: 3,
      conversions: 1.5,
    },
    project: { title: 'Projeto de migração', client: 'Cliente teste', stack: 'TypeScript' },
    conversation: {
      title: 'Conversa de migração',
      messages: [
        { role: 'user', content: 'Pergunta preservada' },
        { role: 'assistant', content: 'Resposta preservada' },
      ],
    },
  };
  const db = await testDatabase(async (name, raw) => {
    if (name !== '0015_agency_integrations.sql') return;
    await raw.exec(
      "CREATE TABLE ai_usage_events(id uuid PRIMARY KEY,model varchar(100) NOT NULL);INSERT INTO ai_usage_events VALUES('00000000-0000-4000-8000-000000000001','future-branch-preserved')",
    );
    await raw.query(
      "INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'migration@test.dev','Migration','hash')",
      [owner],
    );
    for (const [k, v] of Object.entries(examples)) {
      const id = (ids[k] = randomUUID()),
        data = moduleSchemas[k as keyof typeof moduleSchemas].parse(v);
      await raw.query(
        'INSERT INTO workspace_documents(id,kind,owner_id,data,version) VALUES($1,$2,$3,$4,2)',
        [id, k, owner, JSON.stringify(data)],
      );
      await raw.query(
        'INSERT INTO workspace_document_versions(document_id,version,data,actor_id) VALUES($1,1,$2,$3)',
        [id, JSON.stringify(data), owner],
      );
    }
  });
  try {
    expect((await db.pool.query('SELECT model FROM ai_usage_events')).rows[0].model).toBe(
      'future-branch-preserved',
    );
    expect(
      (await db.pool.query("SELECT relkind FROM pg_class WHERE relname='workspace_documents'"))
        .rows[0].relkind,
    ).toBe('v');
    expect(
      (
        await db.pool.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name LIKE 'agency_%' AND data_type='jsonb'",
        )
      ).rows,
    ).toHaveLength(0);
    const store = new ModuleStore(db.pool),
      actor = { id: owner, teamId: null, scope: 'all' as const };
    for (const [k, v] of Object.entries(examples)) {
      const kind = k as keyof typeof moduleSchemas,
        doc = await store.get(ids[k]!, kind, actor);
      expect(doc.data).toEqual(moduleSchemas[kind].parse(v));
      expect(doc.version).toBe(2);
      expect((await store.versions(doc.id, kind, actor))[0]?.data).toEqual(doc.data);
      const changed = await store.save(
        kind,
        actor,
        { ...doc.data, title: 'Título atualizado do módulo' },
        null,
        doc.id,
        doc.version,
      );
      expect(changed.version).toBe(3);
      expect((await store.versions(doc.id, kind, actor)).map((r) => r.version)).toEqual([2, 1]);
    }
    expect((await db.pool.query('SELECT * FROM agency_conversation_messages')).rows).toHaveLength(
      2,
    );
    expect(
      (await db.pool.query('SELECT * FROM agency_conversation_version_messages')).rows,
    ).toHaveLength(4);
  } finally {
    await db.pool.end();
  }
}, 30000);
it('imports idempotently and tracks validated, accepted and partially rejected offline conversion states with Google mocked', async () => {
  const envNames = [
      'CRM_ADS_OFFLINE_ENABLED',
      'CRM_ADS_VALIDATE_ONLY',
      'GOOGLE_ADS_CUSTOMER_ID',
      'GOOGLE_ADS_PROPOSAL_ACTION_ID',
      'GOOGLE_ADS_PAYMENT_ACTION_ID',
      'GOOGLE_OAUTH_CLIENT_ID',
      'GOOGLE_OAUTH_CLIENT_SECRET',
      'GOOGLE_OAUTH_REFRESH_TOKEN',
      'ENCRYPTION_MASTER_KEY_HEX',
    ],
    before = Object.fromEntries(envNames.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    CRM_ADS_OFFLINE_ENABLED: 'true',
    CRM_ADS_VALIDATE_ONLY: 'true',
    GOOGLE_ADS_CUSTOMER_ID: '1234567890',
    GOOGLE_ADS_PROPOSAL_ACTION_ID: '123',
    GOOGLE_ADS_PAYMENT_ACTION_ID: '456',
    GOOGLE_OAUTH_CLIENT_ID: 'mock-client',
    GOOGLE_OAUTH_CLIENT_SECRET: 'mock-secret',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'mock-refresh',
    ENCRYPTION_MASTER_KEY_HEX: randomBytes(32).toString('hex'),
  });
  const db = await testDatabase(),
    owner = randomUUID(),
    other = randomUUID();
  await db.pool.query(
    "INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'import@test.dev','Import','hash'),($2,'other-import@test.dev','Other','hash')",
    [owner, other],
  );
  const calls: { url: string; body: any }[] = [],
    send = vi.fn(async (url: any, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body?.toString() });
      return new Response(
        JSON.stringify(
          String(url).includes('oauth2')
            ? { access_token: 'mock-access' }
            : String(url).includes('requestStatus')
              ? {
                  requestStatusPerDestination: [
                    {
                      requestStatus: 'PARTIAL_SUCCESS',
                      errorInfo: { errorCounts: [{ recordCount: '1' }] },
                      warningInfo: { warningCounts: [{ recordCount: '1' }] },
                    },
                  ],
                }
              : { requestId: 'mock-request-id' },
        ),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
  const { app } = await buildApiServer({ testDatabase: db, adsSend: send }),
    headers = {
      authorization:
        'Bearer ' +
        signAccessToken({
          id: owner,
          email: 'import@test.dev',
          fullName: 'Import',
          roles: ['admin'],
          teamId: null,
          totpEnabled: false,
        }),
    };
  const call = (method: any, url: string, payload?: any, h = headers) =>
    app.inject({ method, url, payload, headers: h });
  try {
    const csv =
      'nome;empresa;telefone;utm_source;utm_campaign;gclid;consentimento_ads\nCliente importado;Projeto importado;41999999999;google;software;test-gclid;granted\nCliente repetido;Mesmo contato;41999999999;google;software;test-gclid;granted';
    const preview = await call('POST', '/api/v1/leads/import/preview', { csv });
    expect(preview.statusCode, preview.body).toBe(200);
    expect(preview.json()).toMatchObject({ valid: 1, duplicates: 1, errors: [] });
    const id = randomUUID(),
      imported = await call('POST', '/api/v1/leads/import', {
        id,
        csv,
        expectedHash: preview.json().hash,
      });
    expect(imported.statusCode, imported.body).toBe(201);
    expect(imported.json()).toMatchObject({ imported: 1, duplicates: 1 });
    expect(
      (
        await call('POST', '/api/v1/leads/import', { id, csv, expectedHash: preview.json().hash })
      ).json().duplicate,
    ).toBe(true);
    const lead = (await db.pool.query('SELECT * FROM workspace_leads')).rows[0];
    expect(lead).toMatchObject({
      utm_source: 'google',
      utm_campaign: 'software',
      gclid: 'test-gclid',
      ad_consent: 'granted',
    });
    const data = {
      title: 'Proposta de teste',
      client: 'Cliente importado',
      valueCents: 100000,
      billing: 'project',
      status: 'accepted',
    };
    const proposal = (
      await call('POST', '/api/v1/workspace/contract', { data, leadId: lead.id })
    ).json().item;
    const input = {
      leadId: lead.id,
      evidenceId: proposal.id,
      evidenceType: 'proposal_accepted',
      confirmed: true,
      eventAt: new Date(Date.now() - 60000).toISOString(),
    };
    const queued = await call('POST', '/api/v1/integrations/ads/offline', input);
    expect(queued.statusCode, queued.body).toBe(201);
    const jobId = queued.json().item.id;
    await call('POST', '/api/v1/integrations/ads/offline', input);
    expect((await db.pool.query('SELECT * FROM agency_offline_conversions')).rows).toHaveLength(1);
    await flushOfflineAds(db.pool, send);
    expect(
      (await db.pool.query('SELECT status FROM agency_offline_conversions WHERE id=$1', [jobId]))
        .rows[0].status,
    ).toBe('validated');
    const payload = JSON.parse(calls.find((c) => c.url.endsWith('events:ingest'))!.body);
    expect(payload.validateOnly).toBe(true);
    expect(payload.events[0]).toMatchObject({
      conversionValue: 1000,
      adIdentifiers: { gclid: 'test-gclid' },
      consent: { adUserData: 'CONSENT_GRANTED', adPersonalization: 'CONSENT_DENIED' },
    });
    process.env.CRM_ADS_VALIDATE_ONLY = 'false';
    expect(
      (
        await call('POST', '/api/v1/integrations/ads/offline/' + jobId + '/retry', {
          confirmed: true,
        })
      ).statusCode,
    ).toBe(200);
    await flushOfflineAds(db.pool, send);
    expect(
      (await db.pool.query('SELECT status FROM agency_offline_conversions WHERE id=$1', [jobId]))
        .rows[0].status,
    ).toBe('provider_accepted');
    const uploads = calls.filter((c) => c.url.endsWith('events:ingest')).length;
    await db.pool.query(
      "UPDATE agency_offline_conversions SET next_attempt_at=now()-interval '1 minute' WHERE id=$1",
      [jobId],
    );
    await flushOfflineAds(db.pool, send);
    expect(
      (
        await db.pool.query(
          'SELECT status,error_count,warning_count FROM agency_offline_conversions WHERE id=$1',
          [jobId],
        )
      ).rows[0],
    ).toMatchObject({ status: 'partial_failure', error_count: 1, warning_count: 1 });
    expect(calls.filter((c) => c.url.endsWith('events:ingest'))).toHaveLength(uploads);
    await db.pool.query("UPDATE workspace_leads SET ad_consent='denied' WHERE id=$1", [lead.id]);
    expect(
      (
        await call('POST', '/api/v1/integrations/ads/offline', {
          ...input,
          evidenceId: randomUUID(),
        })
      ).statusCode,
    ).toBe(409);
    const otherHeaders = {
      authorization:
        'Bearer ' +
        signAccessToken({
          id: other,
          email: 'other@test.dev',
          fullName: 'Other',
          roles: ['vendedor'],
          teamId: null,
          totpEnabled: false,
        }),
    };
    expect(
      (await call('GET', '/api/v1/leads/' + lead.id + '/attribution', undefined, otherHeaders))
        .statusCode,
    ).toBe(404);
  } finally {
    await app.close();
    await db.pool.end();
    for (const name of envNames) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
  }
}, 30000);
it('never serves cached private API or portal pages from the PWA worker', async () => {
  const source = await readFile(new URL('../apps/web/public/sw.js', import.meta.url), 'utf8'),
    handlers: Record<string, (e: any) => void> = {},
    cached: string[] = [],
    cache = { addAll: async (paths: string[]) => cached.push(...paths) },
    context = {
      self: {
        location: { origin: 'https://crm.test' },
        addEventListener: (name: string, handler: any) => {
          handlers[name] = handler;
        },
        registration: {},
        clients: { claim: async () => {} },
      },
      caches: {
        open: async () => cache,
        match: async (path: string) =>
          path === '/offline.html' ? new Response('offline public shell') : undefined,
      },
      fetch: async () => {
        throw new Error('offline');
      },
      URL,
      Response,
    };
  runInNewContext(source, context);
  let pending: Promise<unknown> | undefined;
  handlers.install!({
    waitUntil: (p: Promise<unknown>) => {
      pending = p;
    },
  });
  await pending;
  expect(cached.some((path) => /api|portal|assinar/.test(path))).toBe(false);
  let response: Promise<Response> | undefined;
  handlers.fetch!({
    request: { url: 'https://crm.test/api/v1/workspace/leads', method: 'GET', mode: 'cors' },
    respondWith: (p: Promise<Response>) => {
      response = p;
    },
  });
  expect(response).toBeUndefined();
  handlers.fetch!({
    request: { url: 'https://crm.test/portal/private-token', method: 'GET', mode: 'navigate' },
    respondWith: (p: Promise<Response>) => {
      response = p;
    },
  });
  expect(await (await response!).text()).toBe('offline public shell');
});
