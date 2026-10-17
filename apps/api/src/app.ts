import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { LoginInputSchema } from '@dcfoundry/shared';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  requirePermission,
} from './plugins/auth.js';
import { ImmutableAuditService } from './plugins/audit.js';

export interface DemoUserRecord {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  teamId: string | null;
  roles: Array<'admin' | 'gestor' | 'vendedor' | 'atendente' | 'financeiro' | 'logistica' | 'marketing'>;
  totpEnabled: boolean;
}

export async function buildApiServer(): Promise<{
  app: FastifyInstance;
  auditService: ImmutableAuditService;
}> {
  const app = Fastify({ logger: false });
  const auditService = new ImmutableAuditService();

  await app.register(helmet);
  await app.register(cors, {
    origin: [process.env.WEB_URL ?? 'http://localhost:5173'],
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
  });

  // Usuários iniciais em memória para validação imediata de Auth + RBAC + Audit
  const usersSeed: DemoUserRecord[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'vitor@dcfoundrydigital.com',
      fullName: 'Vitor Henrique Camillo',
      passwordHash: hashPassword('DcFoundry#2026'),
      teamId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      roles: ['admin'],
      totpEnabled: false,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'vendedor@dcfoundrydigital.com',
      fullName: 'Lucas Consultor Comercial',
      passwordHash: hashPassword('Vendedor#2026'),
      teamId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      roles: ['vendedor'],
      totpEnabled: false,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      email: 'logistica@dcfoundrydigital.com',
      fullName: 'Marcos Logística',
      passwordHash: hashPassword('Logistica#2026'),
      teamId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      roles: ['logistica'],
      totpEnabled: false,
    },
  ];

  // Healthcheck
  app.get('/api/v1/health', async () => ({
    status: 'ok',
    service: 'DC Foundry Digital CRM API',
    timestamp: new Date().toISOString(),
  }));

  // Login com emissão de JWT + Cookie Refresh httpOnly + Registro no Audit Log
  app.post('/api/v1/auth/login', async (req, reply) => {
    const parsed = LoginInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        issues: parsed.error.flatten(),
      });
    }

    const user = usersSeed.find((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase());
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      auditService.record({
        actorType: 'user',
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: parsed.data.email,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
        before: null,
        after: { email: parsed.data.email, success: false },
      });
      return reply.status(401).send({
        error: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha inválidos.',
      });
    }

    const payload = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      teamId: user.teamId,
      roles: user.roles,
      totpEnabled: user.totpEnabled,
    };

    const accessToken = signAccessToken(payload);

    auditService.record({
      actorType: 'user',
      actorId: user.id,
      action: 'auth.login_success',
      entityType: 'user',
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
      before: { lastLoginAt: null },
      after: { lastLoginAt: new Date().toISOString(), roles: user.roles },
    });

    reply.setCookie('dcf_refresh_token', `rt_${user.id}_${Date.now()}`, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/v1/auth',
      maxAge: 60 * 60 * 24 * 7,
    });

    return reply.status(200).send({
      accessToken,
      user: payload,
    });
  });

  // Rota protegida por RBAC: Aprovação Financeira de Contrato (exige contract:approve)
  app.post(
    '/api/v1/contracts/:id/approve',
    {
      preHandler: [requirePermission('contract:approve')],
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const entry = auditService.record({
        actorType: 'user',
        actorId: req.authUser?.id ?? null,
        action: 'contract.approve',
        entityType: 'contract',
        entityId: id,
        ipAddress: req.ip,
        before: { status: 'pending_signature' },
        after: { status: 'active', approvedBy: req.authUser?.email },
      });

      return reply.status(200).send({
        contractId: id,
        status: 'active',
        auditLogId: entry.id,
      });
    },
  );

  // Rota protegida por RBAC: Consulta de Audit Logs (exige audit_log:read)
  app.get(
    '/api/v1/audit-logs',
    {
      preHandler: [requirePermission('audit_log:read')],
    },
    async () => ({
      items: auditService.list(),
    }),
  );

  return { app, auditService };
}
