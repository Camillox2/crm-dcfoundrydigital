import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  canAccess,
  type AuthUserPayload,
  type PermissionKey,
  type RbacResourceTarget,
} from '@dcfoundry/shared';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUserPayload;
  }
}

const ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ??
  'dev_access_secret_dc_foundry_digital_crm_replace_in_prod_00000000';

/**
 * Hash de senha com scrypt + salt aleatório de 16 bytes (resistente a GPU/ASIC).
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, originalHex] = parts;
  if (!salt || !originalHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

/**
 * Emissão e verificação de JWT de curta duração (HS256)
 */
export function signAccessToken(payload: AuthUserPayload, expiresInSeconds = 900): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const nowSec = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      iat: nowSec,
      exp: nowSec + expiresInSeconds,
    }),
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', ACCESS_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function verifyAccessToken(token: string): AuthUserPayload | null {
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  const [header, body, signature] = segments;
  if (!header || !body || !signature) return null;

  const expectedSig = crypto
    .createHmac('sha256', ACCESS_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as AuthUserPayload & {
      exp: number;
    };
    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return {
      id: decoded.id,
      email: decoded.email,
      fullName: decoded.fullName,
      teamId: decoded.teamId ?? null,
      roles: decoded.roles,
      totpEnabled: decoded.totpEnabled,
    };
  } catch {
    return null;
  }
}

/**
 * Middleware Fastify de autenticação JWT + verificação RBAC por permissão e escopo.
 */
export function requirePermission(
  permission: PermissionKey,
  resolveTarget?: (req: FastifyRequest) => RbacResourceTarget | undefined,
) {
  return async function rbacPreHandler(req: FastifyRequest, reply: FastifyReply) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'Token de acesso ausente ou inválido.',
      });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const user = verifyAccessToken(token);
    if (!user) {
      return reply.status(401).send({
        error: 'TOKEN_EXPIRED_OR_INVALID',
        message: 'Sessão expirada ou assinatura inválida.',
      });
    }

    req.authUser = user;
    const target = resolveTarget ? resolveTarget(req) : undefined;

    const allowed = canAccess(
      {
        userId: user.id,
        teamId: user.teamId ?? null,
        roles: user.roles,
      },
      permission,
      target,
    );

    if (!allowed) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: `Acesso negado: permissão '${permission}' insuficiente para o seu papel (${user.roles.join(', ')}).`,
      });
    }
  };
}

export async function requireSession(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  const user = header?.startsWith('Bearer ') ? verifyAccessToken(header.slice(7).trim()) : null;
  if (!user)
    return reply
      .status(401)
      .send({ error: 'UNAUTHORIZED', message: 'Entre novamente no workspace.' });
  req.authUser = user;
}
