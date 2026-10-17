import { useEffect, useState } from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';
type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
let pendingInstall: PromptEvent | null = null;

export function PwaInstall({ expanded = false }: { expanded?: boolean }) {
  const [prompt, setPrompt] = useState<PromptEvent | null>(() => pendingInstall);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [installed, setInstalled] = useState(
    () =>
      matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  );
  const [help, setHelp] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if ('serviceWorker' in navigator && import.meta.env.PROD)
      void navigator.serviceWorker
        .register('/sw.js')
        .catch(() =>
          setError(
            'A instalação está temporariamente indisponível. Atualize a página e tente novamente.',
          ),
        );
    const offer = (event: Event) => {
      event.preventDefault();
      pendingInstall = event as PromptEvent;
      setPrompt(event as PromptEvent);
    };
    const online = () => setOffline(!navigator.onLine);
    const done = () => {
      setInstalled(true);
      pendingInstall = null;
      setPrompt(null);
      setHelp(false);
    };
    window.addEventListener('beforeinstallprompt', offer);
    window.addEventListener('appinstalled', done);
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    return () => {
      window.removeEventListener('beforeinstallprompt', offer);
      window.removeEventListener('appinstalled', done);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', online);
    };
  }, []);
  return (
    <>
      {!installed && (expanded || prompt) && (
        <div className={expanded ? 'pwa-install-panel' : undefined}>
          <button
            type="button"
            className={expanded ? 'pwa-install-button' : 'icon-button'}
            aria-label="Instalar CRM como aplicativo"
            aria-expanded={help}
            onClick={async () => {
              if (!prompt) {
                setHelp((visible) => !visible);
                return;
              }
              try {
                await prompt.prompt();
                await prompt.userChoice;
              pendingInstall = null;
                setPrompt(null);
              } catch {
                setError('Não foi possível abrir a instalação. Use o menu do navegador.');
              }
            }}
          >
            <Download size={18} />
            {expanded && 'Instalar aplicativo'}
          </button>
          {help && (
            <p className="pwa-help">
              <Smartphone size={18} />
              No iPhone, abra no Safari e toque em Compartilhar → Adicionar à Tela de Início. No
              Android ou computador, use Instalar aplicativo no menu do navegador.
            </p>
          )}
          {error && (
            <p className="pwa-help" role="status">
              {error}
            </p>
          )}
        </div>
      )}
      {offline && (
        <span className="offline-badge" role="status">
          <WifiOff size={16} />
          Sem conexão · alterações não serão salvas
        </span>
      )}
    </>
  );
}
