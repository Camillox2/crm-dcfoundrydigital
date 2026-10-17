import { describe, it, expect } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { buildApiServer } from '../apps/api/src/app.js';
import { hashPassword } from '../apps/api/src/plugins/auth.js';
import { fixtureUsers } from './fixtures/auth-users.js';
import { testDatabase } from './helpers/database.js';

const sessionHeaders = { 'x-crm-session': '1' };
const login = { email: 'vitor@dcfoundrydigital.com', password: 'DcFoundry#2026' };
const cookie = (response: { headers: Record<string, unknown> }) =>
  String(response.headers['set-cookie']).split(';')[0]!;

describe('Browser login continuity', () => {
  it('restores a remembered login, rejects cross-origin refresh and revokes on logout', async () => {
    const { app } = await buildApiServer({ users: fixtureUsers() });
    try {
      const entered = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: login,
      });
      expect(entered.statusCode).toBe(200);
      const set = String(entered.headers['set-cookie']);
      expect(set).toContain('HttpOnly');
      expect(set).toContain('SameSite=Strict');
      expect(set).toContain('Max-Age=2592000');
      expect(set).not.toContain(entered.json().accessToken);
      const headers = { ...sessionHeaders, cookie: cookie(entered) };
      const restored = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers });
      expect(restored.statusCode).toBe(200);
      expect(restored.json().user.id).toBe(entered.json().user.id);
      expect(restored.headers['cache-control']).toBe('no-store');
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/auth/refresh',
            headers: { ...headers, origin: 'https://foreign.test' },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/auth/logout',
            headers: { cookie: cookie(entered) },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers })).statusCode,
      ).toBe(200);
      expect(
        (await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers })).statusCode,
      ).toBe(401);
    } finally {
      await app.close();
    }
  });
  it('uses a browser-session cookie when remember is unchecked and never issues one for failed login', async () => {
    const { app } = await buildApiServer({ users: fixtureUsers() });
    try {
      const entered = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { ...login, remember: false },
      });
      expect(entered.statusCode).toBe(200);
      expect(String(entered.headers['set-cookie'])).not.toContain('Max-Age');
      const failed = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { ...login, password: 'incorrect-test-password' },
      });
      expect(failed.statusCode).toBe(401);
      expect(failed.headers['set-cookie']).toBeUndefined();
    } finally {
      await app.close();
    }
  });
  it('persists a hashed credential in PostgreSQL and rechecks expiry, account status and roles', async () => {
    const db = await testDatabase();
    const id = randomUUID();
    await db.pool.query(
      "INSERT INTO users(id,email,full_name,password_hash) VALUES($1,'sessions@test.invalid','QA', $2)",
      [id, hashPassword('Synthetic-test-only-42')],
    );
    await db.pool.query(
      "INSERT INTO roles(slug,display_name,permissions_json) VALUES('admin','Admin','{}'),('vendedor','Vendedor','{}') ON CONFLICT DO NOTHING",
    );
    await db.pool.query(
      "INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE slug='admin'",
      [id],
    );
    const { app } = await buildApiServer({ testDatabase: db });
    try {
      const entered = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'sessions@test.invalid', password: 'Synthetic-test-only-42' },
      });
      expect(entered.statusCode, entered.body).toBe(200);
      const raw = decodeURIComponent(cookie(entered).split('=')[1]!);
      const rows = await db.pool.query(
        'SELECT refresh_token_hash FROM auth_sessions WHERE user_id=$1',
        [id],
      );
      expect(rows.rows[0].refresh_token_hash).toBe(createHash('sha256').update(raw).digest('hex'));
      const headers = { ...sessionHeaders, cookie: cookie(entered) };
      const refresh = () => app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers });
      expect((await refresh()).statusCode).toBe(200);
      await db.pool.query(
        "UPDATE user_roles SET role_id=(SELECT id FROM roles WHERE slug='vendedor') WHERE user_id=$1",
        [id],
      );
      expect((await refresh()).json().user.roles).toEqual(['vendedor']);
      await db.pool.query('UPDATE users SET is_active=false WHERE id=$1', [id]);
      expect((await refresh()).statusCode).toBe(401);
      await db.pool.query('UPDATE users SET is_active=true WHERE id=$1', [id]);
      await db.pool.query(
        "UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",
        [id],
      );
      expect((await refresh()).statusCode).toBe(401);
    } finally {
      await app.close();
      await db.pool.end();
    }
  }, 60000);
});
