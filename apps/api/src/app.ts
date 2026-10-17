import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import {
  LoginInputSchema,
  CreateWorkspaceLeadSchema,
  LeadStageSchema,
  resolveGrantedScope,
  ROLES,
  normalizePhoneE164,
} from '@dcfoundry/shared';
import { z } from 'zod';
import { createDatabaseConnection, type DatabaseConnectionResult } from '@dcfoundry/db';
import { PostgresWorkspaceStore, type WorkspaceStore } from './workspace-store.js';
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
  roles: Array<
    'admin' | 'gestor' | 'vendedor' | 'atendente' | 'financeiro' | 'logistica' | 'marketing'
  >;
  totpEnabled: boolean;
}

export async function buildApiServer(
  options: { users?: DemoUserRecord[]; workspaceStore?: WorkspaceStore } = {},
): Promise<{
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

  if (process.env.NODE_ENV === 'production' && options.users)
    throw new Error('Test users are not allowed in production.');
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.JWT_ACCESS_SECRET ||
      process.env.JWT_ACCESS_SECRET.length < 64 ||
      process.env.JWT_ACCESS_SECRET.startsWith('replace_'))
  )
    throw new Error('Configure a strong JWT_ACCESS_SECRET before starting production.');
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL)
    throw new Error('DATABASE_URL is required in production.');
  let connection: Promise<DatabaseConnectionResult> | undefined;
  const database = () => {
    if (!process.env.DATABASE_URL) return null;
    connection ??= createDatabaseConnection(process.env.DATABASE_URL, '');
    return connection;
  };
  const store = async () => {
    if (options.workspaceStore) return options.workspaceStore;
    const db = await database();
    return db ? new PostgresWorkspaceStore(db.pool) : null;
  };
  app.addHook('onClose', async () => {
    if (connection) await (await connection).pool.end();
  });

  // Healthcheck
  app.get('/api/v1/health', async (_request, reply) => {
    if (process.env.NODE_ENV === 'production') {
      try {
        const db = await database();
        await db!.pool.query('SELECT 1 FROM workspace_leads LIMIT 1');
      } catch {
        return reply
          .status(503)
          .send({ status: 'unavailable', service: 'DC Foundry Digital CRM API' });
      }
    }
    return {
      status: 'ok',
      service: 'DC Foundry Digital CRM API',
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      timestamp: new Date().toISOString(),
    };
  });

  // Login com JWT e registro real de acesso, sem usuários de demonstração
  app.post('/api/v1/auth/login', async (req, reply) => {
    const parsed = LoginInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        issues: parsed.error.flatten(),
      });
    }

    let user = options.users?.find(
      (candidate) => candidate.email.toLowerCase() === parsed.data.email.toLowerCase(),
    );
    if (!options.users) {
      const db = await database();
      if (!db) return reply.status(503).send({ error: 'SETUP_REQUIRED' });
      const result = await db.pool.query(
        `SELECT u.id,u.email,u.full_name,u.password_hash,u.team_id,u.totp_enabled,COALESCE(array_agg(r.slug) FILTER (WHERE r.slug IS NOT NULL),'{}') AS roles FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE lower(u.email)=lower($1) AND u.is_active=true GROUP BY u.id`,
        [parsed.data.email],
      );
      const row = result.rows[0];
      if (row)
        user = {
          id: row.id,
          email: row.email,
          fullName: row.full_name,
          passwordHash: row.password_hash,
          teamId: row.team_id,
          roles: row.roles.filter((role: string) => ROLES.includes(role as (typeof ROLES)[number])),
          totpEnabled: row.totp_enabled,
        };
    }
    if (user?.totpEnabled) return reply.status(403).send({ error: 'TOTP_PROVIDER_REQUIRED' });
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
      if (!options.users) return reply.status(501).send({ error: 'CONTRACT_INTEGRATION_REQUIRED' });
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

  app.get(
    '/api/v1/workspace/leads',
    { preHandler: [requirePermission('lead:read')] },
    async (request, reply) => {
      const repository = await store();
      if (!repository) return reply.status(503).send({ error: 'SETUP_REQUIRED' });
      const user = request.authUser!;
      const scope = resolveGrantedScope(user.roles, 'lead:read')!;
      return { items: await repository.list({ id: user.id, teamId: user.teamId ?? null, scope }) };
    },
  );
  app.post(
    '/api/v1/workspace/leads',
    { preHandler: [requirePermission('lead:create')] },
    async (request, reply) => {
      const parsed = CreateWorkspaceLeadSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'INVALID_LEAD' });
      const repository = await store();
      if (!repository) return reply.status(503).send({ error: 'SETUP_REQUIRED' });
      const item = await repository.create(
        { ...parsed.data, phone: normalizePhoneE164(parsed.data.phone) },
        request.authUser!.id,
      );
      auditService.record({
        actorType: 'user',
        actorId: request.authUser!.id,
        action: 'lead.create',
        entityType: 'lead',
        entityId: item.id,
        before: null,
        after: { id: item.id, stage: item.stage },
      });
      return reply.status(201).send({ item });
    },
  );
  app.patch(
    '/api/v1/workspace/leads/:id/stage',
    { preHandler: [requirePermission('lead:update')] },
    async (request, reply) => {
      const id = z
        .string()
        .uuid()
        .safeParse((request.params as { id: unknown }).id);
      const parsed = z.object({ stage: LeadStageSchema }).safeParse(request.body);
      if (!id.success || !parsed.success) return reply.status(400).send({ error: 'INVALID_STAGE' });
      const repository = await store();
      if (!repository) return reply.status(503).send({ error: 'SETUP_REQUIRED' });
      const user = request.authUser!;
      const item = await repository.setStage(id.data, parsed.data.stage, {
        id: user.id,
        teamId: user.teamId ?? null,
        scope: resolveGrantedScope(user.roles, 'lead:update')!,
      });
      if (!item) return reply.status(404).send({ error: 'NOT_FOUND' });
      auditService.record({
        actorType: 'user',
        actorId: user.id,
        action: 'lead.update_stage',
        entityType: 'lead',
        entityId: item.id,
        before: null,
        after: { stage: item.stage },
      });
      return { item };
    },
  );

  return { app, auditService };
}
