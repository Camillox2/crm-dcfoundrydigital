import { expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  validCpfCnpj,
  ContractGenerationInput,
  ContractInput,
  InvoiceInput,
  type WhatsAppCommand,
} from '@dcfoundry/shared';
import { renderServiceContract } from '../apps/api/src/service-contract-template.js';
import { testDatabase } from './helpers/database.js';
import { buildApiServer } from '../apps/api/src/app.js';
import { signAccessToken } from '../apps/api/src/plugins/auth.js';
import { sha256 } from '../apps/api/src/service-contracts.js';
const terms = () =>
  ContractGenerationInput.parse({
    proposalId: randomUUID(),
    proposalVersion: 1,
    serviceType: 'site_landing',
    timeline: 'Etapa de definição, construção e validação em datas acordadas por escrito.',
    deliverables: 'Páginas e funcionalidades descritas no escopo aprovado.',
    outOfScope: 'Novas páginas e integrações não descritas na proposta.',
    paymentTerms: 'Entrada e saldo parcelado conforme a proposta aceita.',
  });
it('validates CPF, numeric CNPJ and the official alphanumeric check-digit example', () => {
  for (const value of [
    '529.982.247-25',
    '111.444.777-35',
    '04.252.011/0001-10',
    '12.ABC.345/01DE-35',
  ])
    expect(validCpfCnpj(value), value).toBe(true);
  for (const value of [
    '00000000000',
    '11111111111',
    '52998224726',
    '12ABC34501DE36',
    '12ABC34501DE3X',
    '12ABC34501DE35<script>',
  ])
    expect(validCpfCnpj(value)).toBe(false);
  expect(
    InvoiceInput.parse({
      title: 'Cobrança de teste',
      client: 'Cliente',
      amountCents: 100,
      dueDate: '2026-10-17',
    }).receipt,
  ).toBe('');
});
it('writes original service templates with the requested clauses and no reference-domain vocabulary', () => {
  const company = {
    name: 'Prestador de teste',
    document: '52998224725',
    address: 'Endereço fictício para testes de software',
    email: 'owner@example.test',
    phone: '+5541999999999',
    representative: 'Representante de teste',
    version: 1,
  };
  const proposal = ContractInput.parse({
    title: 'Proposta de teste',
    client: 'Cliente de teste',
    clientDocument: '11144477735',
    clientAddress: 'Endereço fictício do cliente de teste',
    valueCents: 120000,
    upfrontCents: 50000,
    installments: 2,
    billing: 'project',
    status: 'accepted',
    scope: 'Desenvolvimento das funcionalidades aprovadas',
    terms: 'Condições específicas aprovadas',
  });
  for (const type of ['site_landing', 'system_app', 'paid_marketing', 'maintenance'] as const) {
    const input = { ...terms(), serviceType: type },
      text = renderServiceContract(
        'test-only',
        company,
        proposal,
        input,
        1,
        '2026-10-17T12:00:00Z',
      );
    expect(text.startsWith('modelo, revisar com advogado')).toBe(true);
    for (const clause of [
      'ESCOPO',
      'EXCLUSÕES',
      'REVISÕES',
      'PAGAMENTO',
      'REAJUSTE',
      'PROPRIEDADE INTELECTUAL',
      'HOSPEDAGEM',
      'GARANTIA',
      'CONFIDENCIALIDADE',
      'LGPD',
      'operadora',
      'RESCISÃO',
      'Curitiba/PR',
    ])
      expect(text).toContain(clause);
    expect(text).not.toMatch(/YRIA|hospital|cama|loca[çc][aã]o|frete/i);
    if (type === 'paid_marketing') {
      expect(text).toContain('verba de mídia');
      expect(text).toContain('Não há garantia');
    }
  }
});
it('persists PF identity, versions accepted proposals, signs immutable documents and queues idempotent invitations', async () => {
  const previous = {
    key: process.env.ENCRYPTION_MASTER_KEY_HEX,
    url: process.env.API_URL,
    proxy: process.env.CRM_TRUST_PROXY,
  };
  process.env.ENCRYPTION_MASTER_KEY_HEX = randomBytes(32).toString('hex');
  process.env.API_URL = 'http://127.0.0.1:4000';
  process.env.CRM_TRUST_PROXY = '1';
  const db = await testDatabase(),
    owner = randomUUID(),
    other = randomUUID();
  await db.pool.query(
    `INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'owner@contracts.example','Prestador de teste','hash'),($2,'other@contracts.example','Other','hash')`,
    [owner, other],
  );
  const send = vi.fn(async () => ({ accepted: ['client@example.test'] })),
    published: WhatsAppCommand[] = [];
  const { app, whatsapp } = await buildApiServer({
    testDatabase: db,
    contractMailer: { send },
    whatsappTransport: {
      publish: async (command) => {
        published.push(command);
      },
      close: async () => {},
    },
  });
  const auth = (id: string, role: 'admin' | 'vendedor') => ({
      authorization: `Bearer ${signAccessToken({ id, email: id + '@contracts.example', fullName: 'Pessoa teste', roles: [role], teamId: null, totpEnabled: false })}`,
    }),
    headers = auth(owner, 'admin');
  try {
    expect((await app.inject({ url: '/api/v1/settings/company', headers })).json().item).toBeNull();
    const company = {
      name: 'Prestador de teste',
      document: '529.982.247-25',
      address: 'Endereço fictício completo para testes',
      email: 'owner@example.test',
      phone: '+5541999999999',
      representative: 'Representante de teste',
      version: 0,
    };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/settings/company',
          headers: auth(other, 'vendedor'),
          payload: company,
        })
      ).statusCode,
    ).toBe(403);
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings/company',
      headers,
      payload: company,
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().item.document).toBe('52998224725');
    expect(
      (await db.pool.query('SELECT document_ciphertext FROM company_settings')).rows[0]
        .document_ciphertext,
    ).not.toContain('52998224725');
    const lead = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/workspace/leads',
        headers,
        payload: { name: 'Cliente de teste', company: 'Cliente de teste', phone: '+5541999999998' },
      })
    ).json().item;
    const data = {
      title: 'Site da empresa de teste',
      client: 'Cliente de teste',
      clientDocument: '11144477735',
      clientAddress: 'Endereço fictício do cliente para teste',
      clientEmail: 'client@example.test',
      valueCents: 120000,
      upfrontCents: 50000,
      installments: 2,
      billing: 'project',
      status: 'accepted',
      scope: 'Site responsivo e formulário conforme proposta.',
      terms: 'Entrada e duas parcelas do saldo conforme cronograma.',
    };
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/workspace/contract',
      headers,
      payload: { data, leadId: lead.id },
    });
    expect(created.statusCode, created.body).toBe(201);
    let proposal = created.json().item;
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/v1/workspace/contract/${proposal.id}`,
          headers,
          payload: { data: { ...data, valueCents: 130000 }, leadId: lead.id, version: 1 },
        })
      ).statusCode,
    ).toBe(409);
    const draft = await app.inject({
      method: 'PUT',
      url: `/api/v1/workspace/contract/${proposal.id}`,
      headers,
      payload: { data: { ...data, status: 'draft' }, leadId: lead.id, version: 1 },
    });
    expect(draft.statusCode, draft.body).toBe(200);
    proposal = (
      await app.inject({
        method: 'PUT',
        url: `/api/v1/workspace/contract/${proposal.id}`,
        headers,
        payload: { data, leadId: lead.id, version: 2 },
      })
    ).json().item;
    expect(proposal.version).toBe(3);
    expect(
      (
        await app.inject({ url: `/api/v1/workspace/contract/${proposal.id}/versions`, headers })
      ).json().items,
    ).toHaveLength(2);
    expect(
      (await db.pool.query("SELECT * FROM workspace_documents WHERE kind='contract'")).rows,
    ).toHaveLength(0);
    const input = { ...terms(), proposalId: proposal.id, proposalVersion: 3, upfrontCents: 99999 };
    const generated = await app.inject({
      method: 'POST',
      url: '/api/v1/service-contracts',
      headers,
      payload: input,
    });
    expect(generated.statusCode, generated.body).toBe(201);
    const id = generated.json().id;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/service-contracts',
          headers,
          payload: input,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          url: `/api/v1/service-contracts/${id}`,
          headers: auth(other, 'vendedor'),
        })
      ).statusCode,
    ).toBe(404);
    const link = (
        await app.inject({ method: 'POST', url: `/api/v1/service-contracts/${id}/link`, headers })
      ).json().url,
      token = new URL(link).pathname.split('/').at(-1)!;
    const publicDoc = await app.inject({ url: `/api/public/service-contracts/${token}` });
    expect(publicDoc.statusCode, publicDoc.body).toBe(200);
    const document = publicDoc.json();
    expect(publicDoc.headers['cache-control']).toBe('no-store');
    expect(document.text).toContain('Prestador de teste');
    expect(document.text).toContain('Entrada de R$ 500,00');
    expect(sha256(document.text)).toBe(document.documentHash);
    const changedCompany = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings/company',
      headers,
      payload: {
        ...company,
        name: 'Empresa futura de teste',
        document: '12.ABC.345/01DE-35',
        version: 1,
      },
    });
    expect(changedCompany.statusCode, changedCompany.body).toBe(200);
    const originalDocument = (
      await app.inject({ url: `/api/public/service-contracts/${token}` })
    ).json();
    expect(originalDocument.documentHash).toBe(document.documentHash);
    expect(originalDocument.text).toContain('Prestador de teste');
    expect(originalDocument.text).toContain('52998224725');
    const payload = {
      name: 'Cliente de teste',
      document: '11144477735',
      documentHash: document.documentHash,
      accepted: true,
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/public/service-contracts/${token}/sign`,
          payload: { ...payload, accepted: false },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/public/service-contracts/${token}/sign`,
          payload: { ...payload, documentHash: 'a'.repeat(64) },
        })
      ).statusCode,
    ).toBe(409);
    const signed = await app.inject({
      method: 'POST',
      url: `/api/public/service-contracts/${token}/sign`,
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '198.51.100.24', 'user-agent': 'test-signature-browser' },
      payload,
    });
    expect(signed.statusCode, signed.body).toBe(200);
    const proof = (
      await db.pool.query('SELECT * FROM contract_signatures WHERE contract_id=$1', [id])
    ).rows[0];
    expect(proof.ip_address).toBe('198.51.100.24');
    expect(proof.document_hash).toBe(document.documentHash);
    expect(proof.evidence_hash).toHaveLength(64);
    expect(proof.signed_at).toBeTruthy();
    await expect(
      db.pool.query("UPDATE contract_signatures SET signer_name='Alterado' WHERE id=$1", [
        proof.id,
      ]),
    ).rejects.toThrow('append-only');
    await expect(
      db.pool.query('UPDATE service_contracts SET document_hash=$2 WHERE id=$1', [
        id,
        'b'.repeat(64),
      ]),
    ).rejects.toThrow('immutable');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/service-contracts/${id}/sign`,
          headers,
          payload: {
            name: 'Representante de teste',
            document: '52998224725',
            documentHash: document.documentHash,
            accepted: true,
          },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: `/api/v1/service-contracts/${id}`, headers })).json().status,
    ).toBe('signed');
    const requestId = randomUUID();
    for (let n = 0; n < 2; n++)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/service-contracts/${id}/deliveries`,
            headers,
            payload: { channel: 'email', requestId },
          })
        ).statusCode,
      ).toBe(202);
    expect(send).toHaveBeenCalledOnce();
    const sessionId = await (
      await whatsapp.store()
    ).connect(
      { id: owner, teamId: null, scope: 'all' },
      { provider: 'baileys', importHistory: false },
    );
    await whatsapp.processEvent({
      id: randomUUID(),
      sessionId,
      generation: 1,
      type: 'status',
      status: 'connected',
    });
    const sent = await app.inject({
      method: 'POST',
      url: `/api/v1/service-contracts/${id}/deliveries`,
      headers,
      payload: { channel: 'whatsapp', requestId: randomUUID() },
    });
    expect(sent.statusCode, sent.body).toBe(202);
    expect(
      published.some(
        (c) =>
          c.type === 'send' &&
          c.jid === '5541999999998@s.whatsapp.net' &&
          c.text?.includes('/assinar/'),
      ),
    ).toBe(true);
    const audit = (await db.pool.query('SELECT diff_json FROM audit_logs')).rows
      .map((r) => JSON.stringify(r.diff_json))
      .join('\n');
    expect(audit).not.toContain('52998224725');
    expect(audit).not.toContain('11144477735');
  } finally {
    await app.close();
    await db.pool.end();
    for (const [key, value] of Object.entries({
      ENCRYPTION_MASTER_KEY_HEX: previous.key,
      API_URL: previous.url,
      CRM_TRUST_PROXY: previous.proxy,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}, 30000);
