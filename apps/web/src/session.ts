import type { AuthenticatedSession } from './pages/LoginPage.js';

let current: AuthenticatedSession | null = null;
let refreshing: Promise<AuthenticatedSession | null> | null = null;
let generation = 0;
export function acceptSession(session: AuthenticatedSession) {
  generation++;
  current = session;
}
export function forgetSession() {
  generation++;
  current = null;
}
export function restoreSession() {
  const started = generation;
  refreshing ??= fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-CRM-Session': '1' },
  })
    .then(async (response) => {
      if (started !== generation) return null;
      if (response.status === 401) {
        current = null;
        window.dispatchEvent(new Event('crm:session-expired'));
        return null;
      }
      if (!response.ok) throw new Error('Não foi possível restaurar sua sessão.');
      const data = await response.json();
      if (started !== generation) return null;
      if (!data.accessToken || !data.user?.id) throw new Error('Sessão inválida.');
      current = {
        userId: data.user.id,
        fullName: data.user.fullName,
        email: data.user.email,
        roles: data.user.roles,
        teamId: data.user.teamId ?? '',
        accessToken: data.accessToken,
      };
      return current;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}
export async function endSession() {
  const response = await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-CRM-Session': '1' },
  });
  if (!response.ok)
    throw new Error('Não foi possível sair. Confira sua conexão e tente novamente.');
  forgetSession();
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('dc-crm-session');
    channel.postMessage('logout');
    channel.close();
  }
}
/** Coalesce concurrent refreshes and retry only requests rejected before authorization. */
export async function sessionFetch(path: string, init: RequestInit = {}) {
  const send = () => {
    const headers = new Headers(init.headers);
    if (current?.accessToken) headers.set('Authorization', `Bearer ${current.accessToken}`);
    return fetch(path, { ...init, headers });
  };
  const response = await send();
  if (response.status !== 401 || current?.preview || current?.localReview) return response;
  const restored = await restoreSession();
  if (!restored || init.signal?.aborted) return response;
  return send();
}
