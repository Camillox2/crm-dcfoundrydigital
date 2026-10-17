import { describe, it, expect } from 'vitest';
import { getDailyInsights, CreateWorkspaceLeadSchema, type WorkspaceLead } from '@dcfoundry/shared';
import { validateResetTarget } from '../packages/db/src/reset-policy.js';
import { createContactPhotoSync } from '../apps/worker/src/contact-photos.js';
import { buildApiServer } from '../apps/api/src/app.js';
import { fixtureUsers } from './fixtures/auth-users.js';
import type { WorkspaceActor, WorkspaceStore } from '../apps/api/src/workspace-store.js';

const lead = (overrides: Partial<WorkspaceLead> = {}): WorkspaceLead => ({
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Contato de teste',
  company: 'Empresa de teste',
  phone: '+5541999999999',
  scopeSummary: '',
  modality: 'Projeto Fechado',
  monthlyValue: 2000,
  notes: '',
  highPriority: false,
  stage: 'novo',
  score: 0,
  temperature: 'Frio',
  campaign: '',
  gclid: '',
  avatarUrl: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  ...overrides,
});
describe('Clean workspace and daily Foundry', () => {
  it('starts without invented revenue, follow-ups or client names', () => {
    const insights = getDailyInsights([]);
    expect(insights[0]?.id).toBe('first-contact');
    expect(insights.some((item) => item.id === 'proposals')).toBe(false);
  });
  it('prioritizes open important leads and counts actual proposals', () => {
    const insights = getDailyInsights([
      lead({ highPriority: true, stage: 'orcamento' }),
      lead({ id: 'won', highPriority: true, stage: 'contrato_ativo', monthlyValue: 99999 }),
    ]);
    expect(insights[0]?.leadId).not.toBe('won');
    expect(insights.find((item) => item.id === 'proposals')?.title).toContain('1 proposta');
  });
  it('requires a matching explicit database and rejects system databases', () => {
    expect(() => validateResetTarget(undefined, 'crm')).toThrow();
    expect(() => validateResetTarget('postgres://host/crm', 'other')).toThrow();
    expect(() => validateResetTarget('postgres://host/postgres', 'postgres')).toThrow();
    expect(validateResetTarget('postgres://host/dcfoundry_crm', 'dcfoundry_crm').database).toBe(
      'dcfoundry_crm',
    );
  });
  it('rejects invalid contact details before creating a record', () => {
    expect(
      CreateWorkspaceLeadSchema.safeParse({ name: 'A', company: 'B', phone: '()()()()()' }).success,
    ).toBe(false);
  });
});
describe('Contact photos from a paired socket', () => {
  it('uses the connected socket and caches successful results', async () => {
    let calls = 0;
    const updates: unknown[] = [];
    const sync = createContactPhotoSync(
      {
        profilePictureUrl: async (jid) => {
          calls++;
          expect(jid).toBe('5541999999999@s.whatsapp.net');
          return 'https://cdn.example.test/photo.jpg';
        },
      },
      async (update) => {
        updates.push(update);
      },
    );
    await sync('lead', '+5541999999999');
    await sync('lead', '+5541999999999');
    expect(calls).toBe(1);
    expect(updates).toHaveLength(1);
  });
  it('allows missing/private pictures and preserves old photos on provider failures', async () => {
    const updates: Array<{ photoUrl: string | null }> = [];
    await createContactPhotoSync({ profilePictureUrl: async () => undefined }, async (update) => {
      updates.push(update);
    })('lead', '+5541999999999');
    expect(updates[0]?.photoUrl).toBeNull();
    await createContactPhotoSync(
      {
        profilePictureUrl: async () => {
          throw new Error('offline');
        },
      },
      async (update) => {
        updates.push(update);
      },
    )('lead', '+5541999999999');
    expect(updates).toHaveLength(1);
  });
});
describe('Workspace API', () => {
  it('requires authentication, validates creation and passes the correct owner scope', async () => {
    const scopes: WorkspaceActor[] = [];
    const store: WorkspaceStore = {
      list: async (actor) => {
        scopes.push(actor);
        return [];
      },
      create: async (input, owner) => {
        expect(owner).toBe('22222222-2222-4222-8222-222222222222');
        return lead(input);
      },
      setStage: async (_id, stage, actor) => {
        scopes.push(actor);
        return lead({ stage });
      },
    };
    const { app } = await buildApiServer({ users: fixtureUsers(), workspaceStore: store });
    try {
      expect((await app.inject({ method: 'GET', url: '/api/v1/workspace/leads' })).statusCode).toBe(
        401,
      );
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'vendedor@dcfoundrydigital.com', password: 'Vendedor#2026' },
      });
      const headers = { authorization: `Bearer ${login.json().accessToken}` };
      expect(
        (await app.inject({ method: 'GET', url: '/api/v1/workspace/leads', headers })).json().items,
      ).toEqual([]);
      expect(scopes[0]?.scope).toBe('own');
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/workspace/leads',
            headers,
            payload: { name: '', phone: 'x' },
          })
        ).statusCode,
      ).toBe(400);
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/workspace/leads',
        headers,
        payload: { name: 'Contato de teste', company: 'Empresa de teste', phone: '+5541999999999' },
      });
      expect(created.statusCode).toBe(201);
      const updated = await app.inject({
        method: 'PATCH',
        url: `/api/v1/workspace/leads/${lead().id}/stage`,
        headers,
        payload: { stage: 'orcamento' },
      });
      expect(updated.json().item.stage).toBe('orcamento');
      expect(scopes.at(-1)?.scope).toBe('own');
    } finally {
      await app.close();
    }
  });
  it('does not create or authenticate a built-in demo admin', async () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const { app } = await buildApiServer();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'vitor@dcfoundrydigital.com', password: 'DcFoundry#2026' },
      });
      expect(response.statusCode).toBe(503);
    } finally {
      await app.close();
      if (original) process.env.DATABASE_URL = original;
    }
  });
});
