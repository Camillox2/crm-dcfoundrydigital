import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { testDatabase } from './helpers/database.js';
import { buildApiServer } from '../apps/api/src/app.js';
import { signAccessToken } from '../apps/api/src/plugins/auth.js';
import { ServiceRequestInput } from '../apps/api/src/portal-routes.js';
it('accepts agency service requests and rejects unknown service types or empty descriptions', () => {
  expect(
    ServiceRequestInput.safeParse({
      title: 'Ajuste solicitado',
      kind: 'maintenance',
      description: 'Atualizar a página de serviços',
    }).success,
  ).toBe(true);
  expect(
    ServiceRequestInput.safeParse({
      title: 'Ajuste solicitado',
      kind: 'catalog_checkout',
      description: 'Atualizar página',
    }).success,
  ).toBe(false);
  expect(
    ServiceRequestInput.safeParse({ title: 'Ajuste solicitado', kind: 'support', description: '' })
      .success,
  ).toBe(false);
});
it('isolates portal links, accepts the exact proposal version and records a service-request timeline', async () => {
  const db = await testDatabase(),
    owner = randomUUID(),
    other = randomUUID();
  await db.pool.query(
    "INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'owner@portal.test','Owner','hash'),($2,'other@portal.test','Other','hash')",
    [owner, other],
  );
  const { app } = await buildApiServer({ testDatabase: db });
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
  const call = async (method: any, url: string, payload?: any, h: any = headers) => {
    const r = await app.inject({ method, url, payload, headers: h });
    return r;
  };
  try {
    const lead = (
      await call('POST', '/api/v1/workspace/leads', {
        name: 'Cliente teste',
        company: 'Projeto teste',
        phone: '+5541999999988',
      })
    ).json().item;
    const foreign = (
      await call(
        'POST',
        '/api/v1/workspace/leads',
        { name: 'Outro cliente', company: 'Outro projeto', phone: '+5541999999987' },
        auth(other),
      )
    ).json().item;
    const data = {
      title: 'Site de teste',
      client: 'Cliente teste',
      valueCents: 100000,
      billing: 'project',
      status: 'sent',
      scope: 'Páginas aprovadas',
      terms: 'Pagamento aprovado',
    };
    const proposal = (
      await call('POST', '/api/v1/workspace/contract', { data, leadId: lead.id })
    ).json().item;
    await call('POST', '/api/v1/workspace/contract', {
      data: { ...data, title: 'Proposta privada' },
      leadId: foreign.id,
    });
    await call('POST', '/api/v1/workspace/invoice', {
      data: {
        title: 'Parcela teste',
        client: 'Cliente teste',
        amountCents: 100000,
        dueDate: '2026-12-30',
        receipt: 'Recibo opcional de teste',
      },
      leadId: lead.id,
    });
    expect(
      (
        await call(
          'POST',
          '/api/v1/leads/' + lead.id + '/portal',
          undefined,
          auth(other, 'vendedor'),
        )
      ).statusCode,
    ).toBe(404);
    const link = (await call('POST', '/api/v1/leads/' + lead.id + '/portal')).json(),
      token = link.path.split('/').pop(),
      base = '/api/public/portal/' + token;
    expect((await call('GET', base, undefined, {})).headers['cache-control']).toBe('no-store');
    const portal = (await call('GET', base, undefined, {})).json();
    expect(portal.proposals.map((p: any) => p.id)).toEqual([proposal.id]);
    expect(portal.charges[0].receipt).toBe('Recibo opcional de teste');
    expect(JSON.stringify(portal)).not.toContain('Proposta privada');
    expect(
      (
        await call(
          'POST',
          base + '/proposals/' + proposal.id + '/accept',
          { name: 'Cliente teste', version: 2, accepted: true },
          {},
        )
      ).statusCode,
    ).toBe(409);
    const accepted = await call(
      'POST',
      base + '/proposals/' + proposal.id + '/accept',
      { name: 'Cliente teste', version: 1, accepted: true },
      {},
    );
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(
      (
        await db.pool.query(
          'SELECT actor_type,actor_id FROM agency_proposals_versions WHERE document_id=$1',
          [proposal.id],
        )
      ).rows[0],
    ).toMatchObject({ actor_type: 'client', actor_id: null });
    const ticketResponse = await call(
      'POST',
      base + '/requests',
      {
        title: 'Ajustar formulário',
        kind: 'adjustment',
        description: 'O campo de e-mail precisa de um rótulo.',
      },
      {},
    );
    expect(ticketResponse.statusCode, ticketResponse.body).toBe(201);
    const ticket = ticketResponse.json().item;
    expect(
      (
        await call(
          'POST',
          base + '/requests/' + ticket.id + '/events',
          { message: 'Fechando', status: 'resolved', version: 1 },
          {},
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call('POST', '/api/v1/requests/' + ticket.id + '/events', {
          message: 'Ajuste em desenvolvimento',
          status: 'in_progress',
          version: 1,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await call(
          'POST',
          base + '/requests/' + ticket.id + '/events',
          { message: 'Pode seguir', version: 1 },
          {},
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call(
          'POST',
          base + '/requests/' + ticket.id + '/events',
          { message: 'Pode seguir', version: 2 },
          {},
        )
      ).statusCode,
    ).toBe(200);
    const timeline = (await call('GET', base + '/requests/' + ticket.id, undefined, {})).json();
    expect(timeline.events.map((e: any) => e.actor_type)).toEqual(['client', 'user', 'client']);
    expect(
      (await call('GET', '/api/v1/requests/' + ticket.id, undefined, auth(other, 'vendedor')))
        .statusCode,
    ).toBe(404);
    const foreignLink = (await call('POST', '/api/v1/leads/' + foreign.id + '/portal'))
      .json()
      .path.split('/')
      .pop();
    expect(
      (
        await call(
          'GET',
          '/api/public/portal/' + foreignLink + '/requests/' + ticket.id,
          undefined,
          {},
        )
      ).statusCode,
    ).toBe(404);
    await call('DELETE', '/api/v1/leads/' + lead.id + '/portal/' + link.id);
    expect((await call('GET', base, undefined, {})).statusCode).toBe(404);
  } finally {
    await app.close();
    await db.pool.end();
  }
}, 30000);
