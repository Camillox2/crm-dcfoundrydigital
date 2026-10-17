import { describe, it, expect } from 'vitest';
import {
  canAccess,
  resolveGrantedScope,
  encryptSensitiveField,
  decryptSensitiveField,
  maskPiiForLlm,
  hashForEnhancedConversions,
  normalizePhoneE164,
  computeAuditDiff,
} from '@dcfoundry/shared';
import {
  INITIAL_EQUIPMENT_CATALOG_SEED,
  INITIAL_ROLES_SEED,
  hasReservationOverlap,
  evaluateDueReminders,
  migrateLegacyCrmRecords,
} from '@dcfoundry/db';
import {
  isWithinBusinessHours,
  calculateLeadQualification,
  computeDeterministicEmbedding768,
  searchKnowledgeBase,
  processInboundWhatsAppWithAi,
  DEFAULT_BUSINESS_HOURS,
} from '@dcfoundry/ai';
import {
  parseTouchpointFromUrl,
  decorateWhatsAppLinkWithTrackingCode,
  extractTrackingCodeFromMessage,
  calculateAttributionShares,
  calculateCampaignRoiMetrics,
} from '@dcfoundry/tracking';
import { buildApiServer } from '../apps/api/src/app.js';

describe('Fase 1 — Fundação DC Foundry Digital CRM', () => {
  describe('RBAC Granular (Papéis, Permissões e Escopos own/team/all)', () => {
    it('concede escopo all para Admin em qualquer recurso e ação', () => {
      expect(resolveGrantedScope(['admin'], 'contract:approve')).toBe('all');
      expect(resolveGrantedScope(['admin'], 'marketing_ads:export')).toBe('all');
      expect(
        canAccess(
          { userId: 'u-1', roles: ['admin'] },
          'lead:delete',
          { ownerId: 'outro-usuario' },
        ),
      ).toBe(true);
    });

    it('restringe Vendedor ao escopo own em leads e bloqueia aprovação de contrato', () => {
      const vendedor = { userId: 'vend-1', teamId: 'team-a', roles: ['vendedor'] as const };

      expect(canAccess(vendedor, 'lead:update', { ownerId: 'vend-1' })).toBe(true);
      expect(canAccess(vendedor, 'lead:update', { ownerId: 'vend-2', teamId: 'team-a' })).toBe(false);
      expect(canAccess(vendedor, 'contract:approve')).toBe(false);
    });

    it('permite que Atendente edite leads da mesma equipe (escopo team), mas não de outra equipe', () => {
      const atendente = { userId: 'atend-1', teamId: 'team-a', roles: ['atendente'] as const };

      expect(canAccess(atendente, 'lead:update', { ownerId: 'vend-2', teamId: 'team-a' })).toBe(true);
      expect(canAccess(atendente, 'lead:update', { ownerId: 'vend-9', teamId: 'team-b' })).toBe(false);
    });

    it('garante que os 7 papéis oficiais e o catálogo DC Foundry Digital estão presentes no seed', () => {
      expect(INITIAL_ROLES_SEED).toHaveLength(7);
      expect(INITIAL_EQUIPMENT_CATALOG_SEED.length).toBeGreaterThanOrEqual(4);
      expect(INITIAL_EQUIPMENT_CATALOG_SEED[0]?.sku).toContain('DCF-');
    });
  });

  describe('Segurança & LGPD (Criptografia AES-256-GCM, Mascaramento LLM e E.164)', () => {
    const masterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    it('criptografa e descriptografa credenciais e escopo confidencial (LGPD) com integridade GCM', () => {
      const confidentialNote = 'Credenciais staging e arquitetura proprietária do ERP com integração SAP e WhatsApp.';
      const encrypted = encryptSensitiveField(confidentialNote, masterKey);

      expect(encrypted.ciphertext).not.toContain('SAP');
      const decrypted = decryptSensitiveField(encrypted, masterKey);
      expect(decrypted).toBe(confidentialNote);
    });

    it('mascara CPF, telefone e e-mail antes de enviar contexto para o LLM', () => {
      const rawMessage = 'Olá, meu CPF é 123.456.789-00, telefone (11) 98888-7777 e email diretoria@empresa.com.br';
      const masked = maskPiiForLlm(rawMessage);

      expect(masked).toContain('[CPF_MASCARADO]');
      expect(masked).toContain('[TELEFONE_MASCARADO]');
      expect(masked).toContain('[EMAIL_MASCARADO]');
      expect(masked).not.toContain('123.456.789-00');
    });

    it('normaliza telefones brasileiros para E.164 e gera hash SHA-256 para Enhanced Conversions', () => {
      expect(normalizePhoneE164('(11) 99123-4567')).toBe('+5511991234567');
      expect(hashForEnhancedConversions('  Vitor@DCFoundryDigital.com ')).toHaveLength(64);
    });
  });

  describe('Audit Log Imutável e Diff Antes/Depois', () => {
    it('calcula diff exato entre estados e redacta campos secretos automaticamente', () => {
      const diff = computeAuditDiff(
        { status: 'pending_signature', monthlyValueCents: 1850000, passwordHash: 'old_secret' },
        { status: 'active', monthlyValueCents: 1850000, passwordHash: 'new_secret' },
      );

      expect(diff).toEqual({
        status: { before: 'pending_signature', after: 'active' },
        passwordHash: { before: '[REDACTED]', after: '[REDACTED]' },
      });
    });
  });

  describe('API Fastify — Autenticação JWT, Cookie httpOnly, Enforcement 403 RBAC e Audit Log', () => {
    it('autentica Admin, bloqueia Vendedor com 403 em rota de aprovação e registra tudo no Audit Log', async () => {
      const { app } = await buildApiServer();

      const vendLoginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'vendedor@dcfoundrydigital.com',
          password: 'Vendedor#2026',
        },
      });
      expect(vendLoginRes.statusCode).toBe(200);
      const vendToken = vendLoginRes.json().accessToken as string;

      const forbiddenRes = await app.inject({
        method: 'POST',
        url: '/api/v1/contracts/ctr-001/approve',
        headers: {
          authorization: `Bearer ${vendToken}`,
        },
      });
      expect(forbiddenRes.statusCode).toBe(403);
      expect(forbiddenRes.json().error).toBe('FORBIDDEN');

      const adminLoginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'vitor@dcfoundrydigital.com',
          password: 'DcFoundry#2026',
        },
      });
      expect(adminLoginRes.statusCode).toBe(200);
      expect(adminLoginRes.headers['set-cookie']).toBeDefined();
      const adminToken = adminLoginRes.json().accessToken as string;

      const approveRes = await app.inject({
        method: 'POST',
        url: '/api/v1/contracts/ctr-001/approve',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });
      expect(approveRes.statusCode).toBe(200);
      expect(approveRes.json().status).toBe('active');

      const auditRes = await app.inject({
        method: 'GET',
        url: '/api/v1/audit-logs',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });
      expect(auditRes.statusCode).toBe(200);
      const logs = auditRes.json().items as Array<{ action: string; diffJson: Record<string, unknown> }>;
      expect(logs.some((l) => l.action === 'contract.approve')).toBe(true);
      expect(logs.some((l) => l.action === 'auth.login_success')).toBe(true);

      await app.close();
    });
  });
});

describe('Fases 2, 3 e 4 — CRM Core, WhatsApp Multi-Sessão & Agente IA + RAG pgvector', () => {
  it('verifica janela de expediente e feriados determinísticos em America/Sao_Paulo', () => {
    // Terça-feira 14h UTC-3 (17h UTC) -> dentro do horário comercial
    const businessMoment = new Date('2026-10-20T17:00:00.000Z');
    expect(isWithinBusinessHours(businessMoment, DEFAULT_BUSINESS_HOURS)).toBe(true);

    // Feriado de Natal -> fora do horário comercial
    const holidayMoment = new Date('2026-12-25T15:00:00.000Z');
    expect(isWithinBusinessHours(holidayMoment, DEFAULT_BUSINESS_HOURS)).toBe(false);
  });

  it('qualifica leads automaticamente, consulta RAG pgvector (768-d) e executa Handoff humano imediato', () => {
    const qual = calculateLeadQualification({
      fullName: 'Ricardo Mendes',
      city: 'São Paulo',
      solutionCategory: 'saas_squad',
      modality: 'retainer',
      contractMonths: 12,
      priorityLaunchUrgency: true,
    });
    expect(qual.temperature).toBe('hot');
    expect(qual.score).toBeGreaterThanOrEqual(75);
    expect(qual.recommendedStageSlug).toBe('proposta_enviada');

    const chunks = [
      {
        id: 'chk-1',
        documentId: 'doc-1',
        documentTitle: 'Playbook Comercial — Squads Dedicadas SaaS',
        category: 'catalog' as const,
        chunkIndex: 0,
        contentText: 'Squad Dedicada Full-Stack com arquiteto sênior, engenharia React/Node e SLA 99.9%.',
        embedding: computeDeterministicEmbedding768('Squad Dedicada Full-Stack engenharia SaaS'),
      },
    ];
    const ragResults = searchKnowledgeBase('proposta squad dedicada engenharia SaaS', chunks, 1);
    expect(ragResults).toHaveLength(1);
    expect(ragResults[0]?.chunk.id).toBe('chk-1');

    // Mensagem solicitando especialista humano -> pausa IA imediatamente (aiPausedNextState = true)
    const handoffDecision = processInboundWhatsAppWithAi({
      contactId: 'cnt-101',
      contactName: 'Ricardo Mendes',
      aiPaused: false,
      rawMessageText: 'Quero falar com um especialista humano sobre o contrato anual da squad',
      knowledgeBase: chunks,
    });
    expect(handoffDecision.handoff.shouldHandoff).toBe(true);
    expect(handoffDecision.aiPausedNextState).toBe(true);
  });
});

describe('Fase 5 — Operação, Alocação Sem Conflito & Régua Financeira no WhatsApp', () => {
  it('impede dupla alocação da mesma squad/instância em períodos sobrepostos', () => {
    const existing = [
      {
        id: 'slot-1',
        resourceUnitId: 'squad-alpha',
        contractId: 'CTR-2026-0104',
        startsAtIso: '2026-10-01T00:00:00.000Z',
        endsAtIso: '2026-10-31T23:59:59.000Z',
        isActive: true,
      },
    ];

    expect(
      hasReservationOverlap(existing, {
        resourceUnitId: 'squad-alpha',
        startsAtIso: '2026-10-15T00:00:00.000Z',
        endsAtIso: '2026-11-15T00:00:00.000Z',
      }),
    ).toBe(true);

    expect(
      hasReservationOverlap(existing, {
        resourceUnitId: 'squad-alpha',
        startsAtIso: '2026-11-01T00:00:00.000Z',
        endsAtIso: '2026-11-30T00:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('dispara lembretes de renovação (D-3) e vencimento de fatura Pix com relógio simulado', () => {
    const reminders = evaluateDueReminders({
      simulatedNow: new Date('2026-10-17T12:00:00.000Z'),
      contracts: [
        {
          contractCode: 'CTR-2026-0104',
          contactName: 'Apex Logística S.A.',
          phoneE164: '+5511998887777',
          expectedRenewalIso: '2026-10-20T00:00:00.000Z',
          status: 'active',
        },
      ],
      invoices: [
        {
          invoiceId: 'INV-901',
          contractCode: 'CTR-2026-0104',
          contactName: 'Apex Logística S.A.',
          phoneE164: '+5511998887777',
          dueDateIso: '2026-10-17',
          amountCents: 1850000,
          status: 'pending',
        },
      ],
    });

    expect(reminders).toHaveLength(2);
    expect(reminders.some((r) => r.type === 'contract_renewal_due')).toBe(true);
    expect(reminders.some((r) => r.type === 'billing_due_soon')).toBe(true);
  });
});

describe('Fase 6 — Marketing, Atribuição & Google Ads Offline Conversions', () => {
  it('captura gclid/UTM, decora link de WhatsApp com código [DCF-XXXX] e calcula CPL/CAC/ROAS', () => {
    const touchpoint = parseTouchpointFromUrl(
      'https://dcfoundrydigital.com/solucoes?utm_source=google&utm_medium=cpc&utm_campaign=Search_SaaS_Squad_SP&gclid=CjwKCAjw_dc_99210_sp',
      'DCF-A9F3',
      'https://www.google.com/',
    );
    expect(touchpoint.gclid).toBe('CjwKCAjw_dc_99210_sp');
    expect(touchpoint.utmCampaign).toBe('Search_SaaS_Squad_SP');

    const waUrl = decorateWhatsAppLinkWithTrackingCode(
      'https://wa.me/5511999990000?text=Ol%C3%A1%2C%20quero%20uma%20proposta',
      'DCF-A9F3',
    );
    expect(waUrl).toContain('DCF-A9F3');

    const decodedMsg = 'Olá, quero uma proposta [Ref: DCF-A9F3]';
    expect(extractTrackingCodeFromMessage(decodedMsg)).toBe('DCF-A9F3');

    const shares = calculateAttributionShares(
      [touchpoint, { ...touchpoint, utmCampaign: 'Remarketing_Enterprise', gclid: 'CjwKCAjw_dc_2' }],
      1850000,
      'linear',
    );
    expect(shares).toHaveLength(2);
    expect(shares[0]?.weight).toBeCloseTo(0.5);
    expect(shares[0]?.attributedValueCents).toBe(925000);

    const roi = calculateCampaignRoiMetrics({
      campaignId: 'cmp-01',
      campaignName: 'Search_SaaS_Squad_SP',
      costCents: 420000, // R$ 4.200,00
      clicks: 640,
      totalLeads: 38,
      qualifiedLeads: 24,
      closedContracts: 7,
      revenueCents: 12950000, // R$ 129.500,00
    });
    expect(roi.roasMultiplier).toBeGreaterThan(30);
    expect(roi.cplCents).toBeGreaterThan(0);
  });
});

describe('Fase 7 — Migração Sem Perda de crm_records (JSONB Legado)', () => {
  it('migra registros legados normalizando E.164, deduplicando contatos e garantindo zero perda', () => {
    const result = migrateLegacyCrmRecords([
      {
        collection: 'clients',
        id: 'leg-cli-1',
        data: {
          nome: 'Construtora Vanguarda',
          telefone: '(11) 98811-2233',
          email: 'tech@vanguarda.com.br',
        },
      },
      {
        collection: 'leads',
        id: 'leg-lead-1',
        data: {
          name: 'Construtora Vanguarda',
          phone: '11988112233',
          title: 'Plataforma SaaS + IA WhatsApp',
          stage: 'proposta_enviada',
        },
      },
      {
        collection: 'contracts',
        id: 'leg-ctr-1',
        data: {
          code: 'CTR-2026-0098',
          phone: '+55 11 98811-2233',
          monthlyValueCents: 1850000,
        },
      },
    ]);

    expect(result.stats.totalInputRecords).toBe(3);
    expect(result.stats.zeroLossVerified).toBe(true);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]?.phoneE164).toBe('+5511988112233');
    expect(result.leads).toHaveLength(1);
    expect(result.contracts).toHaveLength(1);
  });
});
