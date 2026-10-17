import { sessionFetch } from '../session.js';
import { useCallback, useEffect, useState, useRef } from 'react';
import { Bell, Check, Smartphone, X } from 'lucide-react';
import type { WorkspacePage } from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../pages/LoginPage.js';
import { useCrmApi } from './modules/useModule.js';
export async function removeBrowserPush(user: AuthenticatedSession) {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration(),
    subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await sessionFetch('/api/v1/notifications/push', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + user.accessToken },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);
    await subscription.unsubscribe();
  }
}
export function NotificationCenter({
  user,
  onNavigate,
}: {
  user: AuthenticatedSession;
  onNavigate: (page: WorkspacePage) => void;
}) {
  const seen = useRef(new Set<string>());
  const request = useCrmApi(user),
    [open, setOpen] = useState(false),
    [items, setItems] = useState<any[]>([]),
    [unread, setUnread] = useState(0),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (user.preview) return;
    try {
      const data = await request('/api/v1/notifications');
      if (data.items.some((item: any) => item.kind === 'new_lead' && !seen.current.has(item.id)))
        window.dispatchEvent(new Event('crm:leads-changed'));
      seen.current = new Set(data.items.map((item: any) => String(item.id)));
      setItems(data.items);
      setUnread(data.unread);
    } catch (e) {
      if (open) setError((e as Error).message);
    }
  }, [request, user.preview, open]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
        if (!document.hidden) void load();
      }, 30000),
      event = () => {
        setOpen(true);
        void load();
      };
    navigator.serviceWorker?.addEventListener('message', event);
    return () => {
      clearInterval(timer);
      navigator.serviceWorker?.removeEventListener('message', event);
    };
  }, [load]);
  const subscribe = async () => {
    setBusy(true);
    setError('');
    try {
      if (
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      )
        throw new Error('Este navegador não oferece notificações push.');
      const config = await request('/api/v1/notifications/push');
      if (!config.configured)
        throw new Error('As chaves de notificações ainda precisam ser configuradas no servidor.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted')
        throw new Error('As notificações não foram autorizadas no navegador.');
      const registration = await navigator.serviceWorker.register('/sw.js'),
        ready = await navigator.serviceWorker.ready;
      const key = Uint8Array.from(
        atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/')),
        (c) => c.charCodeAt(0),
      );
      const subscription =
        (await ready.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      await request('/api/v1/notifications/push', {
        method: 'POST',
        body: JSON.stringify(subscription.toJSON()),
      });
      setStatus('Notificações ativadas neste dispositivo.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const read = async (id?: string) => {
    try {
      await request('/api/v1/notifications/read', {
        method: 'POST',
        body: JSON.stringify(id ? { id } : { all: true }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="notification-wrap">
      <button
        className="icon-button"
        type="button"
        aria-label={'Notificações' + (unread ? ', ' + unread + ' não lidas' : '')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={18} />
        {unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <section className="notification-center" aria-label="Central de notificações">
          <header>
            <div>
              <strong>Seu dia, conectado.</strong>
              <small>{unread} atualizações não lidas</small>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Fechar notificações"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </header>
          <button className="notification-action" onClick={() => void read()}>
            <Check size={15} />
            Marcar todas como lidas
          </button>
          <div className="notification-list">
            {items.map((item) => (
              <button
                className={'notification-item ' + (!item.read_at ? 'is-unread' : '')}
                key={item.id}
                onClick={() => {
                  void read(item.id);
                  onNavigate(item.page as WorkspacePage);
                  setOpen(false);
                }}
              >
                <strong>{item.title}</strong>
                <span>{item.body}</span>
                <time>{new Date(item.created_at).toLocaleString('pt-BR')}</time>
              </button>
            ))}
            {!items.length && <p>Nenhuma atualização por enquanto.</p>}
          </div>
          <footer>
            <button
              disabled={busy}
              className="notification-action"
              onClick={() => void subscribe()}
            >
              <Smartphone size={15} />
              Ativar notificações neste dispositivo
            </button>
            <button
              className="notification-action"
              onClick={async () => {
                try {
                  await removeBrowserPush(user);
                  setStatus('Notificações desativadas neste dispositivo.');
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Desativar neste dispositivo
            </button>
            {status && <p role="status">{status}</p>}
            {error && <p role="alert">{error}</p>}
          </footer>
        </section>
      )}
    </div>
  );
}
