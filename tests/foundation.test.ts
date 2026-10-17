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
import { INITIAL_EQUIPMENT_CATALOG_SEED, INITIAL_ROLES_SEED } from '@dcfoundry/db';
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

    it('garante que os 7 papéis oficiais estão presentes no seed do banco', () => {
      expect(INITIAL_ROLES_SEED).toHaveLength(7);
      expect(INITIAL_EQUIPMENT_CATALOG_SEED.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Segurança & LGPD (Criptografia AES-256-GCM, Mascaramento LLM e E.164)', () => {
    const masterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    it('criptografa e descriptografa dados clínicos sensíveis (Art. 11 LGPD) com integridade GCM', () => {
      const clinicalNote = 'Paciente pós-AVC, alta hospitalar prevista amanhã, necessita cama motorizada 3 movimentos.';
      const encrypted = encryptSensitiveField(clinicalNote, masterKey);

      expect(encrypted.ciphertext).not.toContain('AVC');
      const decrypted = decryptSensitiveField(encrypted, masterKey);
      expect(decrypted).toBe(clinicalNote);
    });

    it('mascara CPF, telefone e e-mail antes de enviar contexto para o LLM', () => {
      const rawMessage = 'Olá, meu CPF é 123.456.789-00, telefone (11) 98888-7777 e email cliente@exemplo.com.br';
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
        { status: 'pending_signature', monthlyValueCents: 45000, passwordHash: 'old_secret' },
        { status: 'active', monthlyValueCents: 45000, passwordHash: 'new_secret' },
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

      // 1. Login como Vendedor
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

      // 2. Vendedor tenta aprovar contrato -> deve receber 403 FORBIDDEN
      const forbiddenRes = await app.inject({
        method: 'POST',
        url: '/api/v1/contracts/ctr-001/approve',
        headers: {
          authorization: `Bearer ${vendToken}`,
        },
      });
      expect(forbiddenRes.statusCode).toBe(403);
      expect(forbiddenRes.json().error).toBe('FORBIDDEN');

      // 3. Login como Admin (Vitor)
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

      // 4. Admin aprova contrato -> 200 OK
      const approveRes = await app.inject({
        method: 'POST',
        url: '/api/v1/contracts/ctr-001/approve',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });
      expect(approveRes.statusCode).toBe(200);
      expect(approveRes.json().status).toBe('active');

      // 5. Admin consulta Audit Logs e verifica que login e aprovação foram gravados com diff
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
