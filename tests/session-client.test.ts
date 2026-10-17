// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedSession } from '../apps/web/src/pages/LoginPage.js';

const user: AuthenticatedSession = {
  userId: 'test-user',
  fullName: 'QA',
  email: 'qa@test.invalid',
  roles: ['admin'],
  teamId: '',
  accessToken: 'old-test-token',
};
const refreshed = {
  accessToken: 'new-test-token',
  user: { id: user.userId, fullName: 'QA', email: user.email, roles: ['admin'] },
};
const response = (status: number, data = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('In-memory browser session client', () => {
  it('coalesces refreshes and retries authenticated reads with the fresh token', async () => {
    const client = await import('../apps/web/src/session.js');
    client.acceptSession(user);
    let refreshes = 0;
    const fetchMock = vi.fn(async (path: string, init: RequestInit) => {
      if (path.endsWith('/refresh')) {
        refreshes++;
        return response(200, refreshed);
      }
      return response(
        new Headers(init.headers).get('Authorization') === 'Bearer new-test-token' ? 200 : 401,
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const results = await Promise.all([
      client.sessionFetch('/api/v1/workspace/leads'),
      client.sessionFetch('/api/v1/settings/company'),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(refreshes).toBe(1);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
  it('does not repeat a rejected mutation when the refresh is expired', async () => {
    const client = await import('../apps/web/src/session.js');
    client.acceptSession(user);
    const expired = vi.fn();
    window.addEventListener('crm:session-expired', expired);
    const fetchMock = vi.fn(async () => response(401));
    vi.stubGlobal('fetch', fetchMock);
    expect(
      (await client.sessionFetch('/api/v1/workspace/leads', { method: 'POST', body: '{}' })).status,
    ).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(expired).toHaveBeenCalledOnce();
    window.removeEventListener('crm:session-expired', expired);
  });
  it('prevents an in-flight refresh from reviving a session after logout', async () => {
    const client = await import('../apps/web/src/session.js');
    let finish!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const pending = client.restoreSession();
    client.forgetSession();
    finish(response(200, refreshed));
    expect(await pending).toBeNull();
  });
});
