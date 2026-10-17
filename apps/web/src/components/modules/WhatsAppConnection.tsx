import { useCallback, useEffect, useState } from 'react';
import { QrCode, RefreshCw, Wifi, WifiOff, X } from 'lucide-react';
import { Card, Button } from '@dcfoundry/ui';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi } from './useModule.js';
import { useDialogFocus } from '../useDialogFocus.js';
import '../whatsapp/whatsapp.css';
export type Session = {
  id: string;
  provider: string;
  status: string;
  qr: string | null;
  pairing_code: string | null;
  history_progress: number;
  phone: string | null;
  import_history: boolean;
};
const labels: Record<string, string> = {
  disconnected: 'Desconectado',
  connecting: 'Conectando',
  qr: 'Aguardando leitura do QR',
  pairing: 'Aguardando pareamento',
  connected: 'Conectado',
  reconnecting: 'Reconectando',
  logged_out: 'Sessão encerrada no telefone',
  error: 'Falha na conexão',
};
export function WhatsAppConnection({
  user,
  onSession,
}: {
  user: AuthenticatedSession;
  onSession?: (session: Session | undefined) => void;
}) {
  const request = useCrmApi(user),
    [sessions, setSessions] = useState<Session[]>([]),
    [open, setOpen] = useState(false),
    [method, setMethod] = useState('qr'),
    [phone, setPhone] = useState(''),
    [importHistory, setImportHistory] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useDialogFocus(open);
  const reload = useCallback(async () => {
    if (user.preview) return;
    try {
      const data = await request('/api/v1/whatsapp/sessions');
      setSessions(data.items);
      onSession?.(data.items[0]);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [request, user.preview, onSession]);
  useEffect(() => {
    void reload();
    const changed = () => void reload();
    window.addEventListener('crm:whatsapp-changed', changed);
    const timer = setInterval(() => void reload(), 3000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('crm:whatsapp-changed', changed);
    };
  }, [reload]);
  const session = sessions[0],
    manage = user.roles.includes('admin');
  const command = async (action: string) => {
    setBusy(true);
    setError('');
    try {
      await request(`/api/v1/whatsapp/sessions${session ? '/' + session.id + '/' + action : ''}`, {
        method: 'POST',
        body: JSON.stringify(
          action === 'connect'
            ? { provider: 'baileys', phone: method === 'code' ? phone : undefined, importHistory }
            : {},
        ),
      });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Card className="wa-connection">
        <div className="wa-connection-label">
          {session?.status === 'connected' ? <Wifi size={20} /> : <WifiOff size={20} />}
          <div>
            <strong>Conectar WhatsApp</strong>
            <p>
              {labels[session?.status ?? 'disconnected']} {session?.phone ?? ''}
            </p>
          </div>
        </div>
        <span>Histórico recebido: {session?.history_progress ?? 0}%</span>
        {manage && (
          <div className="module-actions">
            <Button variant="outline" id="wa-connect-open" onClick={() => setOpen(true)}>
              <QrCode size={16} />
              Conectar
            </Button>
            {session && (
              <>
                <Button variant="outline" disabled={busy} onClick={() => void command('sync')}>
                  <RefreshCw size={16} />
                  Sincronizar
                </Button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void command('disconnect')}
                >
                  Desconectar
                </button>
              </>
            )}
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </Card>
      {open && (
        <div className="workspace-dialog-overlay">
          <section
            className="workspace-dialog wa-pairing"
            role="dialog"
            data-crm-dialog
            aria-modal="true"
            aria-labelledby="wa-pairing-title"
          >
            <button
              className="icon-button"
              aria-label="Fechar pareamento"
              onClick={() => setOpen(false)}
            >
              <X />
            </button>
            <h2 id="wa-pairing-title">Conecte seu WhatsApp.</h2>
            <p>No telefone, abra WhatsApp → Aparelhos conectados.</p>
            <div className="module-tabs">
              <button aria-pressed={method === 'qr'} onClick={() => setMethod('qr')}>
                QR code
              </button>
              <button aria-pressed={method === 'code'} onClick={() => setMethod('code')}>
                Código de pareamento
              </button>
            </div>
            {method === 'code' && (
              <label>
                Número com DDI
                <input
                  type="tel"
                  placeholder="+5541999999999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
            )}
            <label className="wa-history-option">
              <input
                type="checkbox"
                checked={importHistory}
                onChange={(e) => setImportHistory(e.target.checked)}
              />
              Criar contatos também a partir do histórico recebido
            </label>
            <p>
              O histórico depende do que o telefone disponibiliza. Mensagens antigas não recebem
              respostas automáticas.
            </p>
            {session?.qr && method === 'qr' && (
              <img
                className="wa-qr"
                src={session.qr}
                alt="QR code para conectar o WhatsApp da agência"
              />
            )}
            {session?.pairing_code && (
              <output className="wa-pairing-code">{session.pairing_code}</output>
            )}
            <p role="status">{labels[session?.status ?? 'disconnected']}</p>
            {error && <p role="alert">{error}</p>}
            <Button
              disabled={busy || !manage || (method === 'code' && !/^\+[1-9]\d{7,14}$/.test(phone))}
              onClick={() => void command('connect')}
            >
              {busy ? 'Preparando…' : 'Gerar conexão'}
            </Button>
          </section>
        </div>
      )}
    </>
  );
}
