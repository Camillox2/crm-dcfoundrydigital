import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DatabaseConnectionResult } from '@dcfoundry/db';
import { ROLES, type AuthUserPayload } from '@dcfoundry/shared';
import { signAccessToken } from './plugins/auth.js';

const cookieName = 'dc_crm_session';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type SavedSession = { user: AuthUserPayload; expires: number };

/** Only the opaque refresh credential is persisted; access tokens stay in memory. */
export function browserSessions(
  app: FastifyInstance,
  database: () => Promise<DatabaseConnectionResult | null>,
  fixtureMode = false,
) {
  const fixtures = new Map<string, SavedSession>();
  const cookieOptions = {
    path: '/api/v1/auth',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
  };
  const trusted = (req: FastifyRequest, reply: FastifyReply) => {
    const origin = req.headers.origin;
    if (
      req.headers['x-crm-session'] !== '1' ||
      (origin && origin !== (process.env.WEB_URL ?? 'http://localhost:5173'))
    ) {
      void reply.status(403).send({ error: 'INVALID_SESSION_ORIGIN' });
      return false;
    }
    return true;
  };
  const clear = (reply: FastifyReply) => reply.clearCookie(cookieName, cookieOptions);
  const issue = async (
    req: FastifyRequest,
    reply: FastifyReply,
    user: AuthUserPayload,
    remember: boolean,
  ) => {
    const token = randomBytes(32).toString('base64url');
    const seconds = remember ? 30 * 24 * 60 * 60 : 8 * 60 * 60;
    const expires = new Date(Date.now() + seconds * 1000);
    if (fixtureMode) fixtures.set(hash(token), { user, expires: expires.getTime() });
    else {
      const db = await database();
      if (!db) throw new Error('Session database unavailable');
      await db.pool.query(
        'INSERT INTO auth_sessions(user_id,refresh_token_hash,ip_address,user_agent,expires_at) VALUES($1,$2,$3,$4,$5)',
        [user.id, hash(token), req.ip, req.headers['user-agent'] ?? null, expires],
      );
      await db.pool.query(
        'DELETE FROM auth_sessions WHERE user_id=$1 AND (expires_at < now() OR revoked_at IS NOT NULL)',
        [user.id],
      );
    }
    reply.setCookie(cookieName, token, {
      ...cookieOptions,
      ...(remember ? { maxAge: seconds } : {}),
    });
  };
  app.post('/api/v1/auth/refresh', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!trusted(req, reply)) return;
    const token = req.cookies[cookieName];
    if (!token) return reply.status(401).send({ error: 'NO_SESSION' });
    let user: AuthUserPayload | undefined;
    if (fixtureMode) {
      const saved = fixtures.get(hash(token));
      if (saved && saved.expires > Date.now()) user = saved.user;
    } else {
      const db = await database();
      if (!db) return reply.status(503).send({ error: 'SETUP_REQUIRED' });
      const result = await db.pool.query(
        `SELECT u.id,u.email,u.full_name,u.team_id,u.totp_enabled,
          COALESCE(array_agg(r.slug) FILTER (WHERE r.slug IS NOT NULL),'{}') AS roles
         FROM auth_sessions s JOIN users u ON u.id=s.user_id
         LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id
         WHERE s.refresh_token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()
           AND u.is_active=true GROUP BY u.id`,
        [hash(token)],
      );
      const row = result.rows[0];
      if (row && !row.totp_enabled)
        user = {
          id: row.id,
          email: row.email,
          fullName: row.full_name,
          teamId: row.team_id,
          roles: row.roles.filter((role: string) => ROLES.includes(role as (typeof ROLES)[number])),
          totpEnabled: row.totp_enabled,
        };
    }
    if (!user) {
      clear(reply);
      return reply.status(401).send({ error: 'SESSION_EXPIRED' });
    }
    return { accessToken: signAccessToken(user), user };
  });
  app.post('/api/v1/auth/logout', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!trusted(req, reply)) return;
    const token = req.cookies[cookieName];
    if (token) {
      if (fixtureMode) fixtures.delete(hash(token));
      else {
        const db = await database();
        if (!db) return reply.status(503).send({ error: 'SETUP_REQUIRED' });
        await db.pool.query(
          'UPDATE auth_sessions SET revoked_at=now() WHERE refresh_token_hash=$1',
          [hash(token)],
        );
      }
    }
    clear(reply);
    return { ok: true };
  });
  return { issue };
}
