import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function PwaInstall() {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null),
    [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    const offer = (e: Event) => {
        e.preventDefault();
        setPrompt(e as PromptEvent);
      },
      online = () => setOffline(!navigator.onLine);
    window.addEventListener('beforeinstallprompt', offer);
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    return () => {
      window.removeEventListener('beforeinstallprompt', offer);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', online);
    };
  }, []);
  return (
    <>
      {prompt && (
        <button
          type="button"
          className="icon-button"
          aria-label="Instalar CRM como aplicativo"
          title="Instalar aplicativo"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
          }}
        >
          <Download size={18} />
        </button>
      )}
      {offline && (
        <span className="offline-badge" role="status">
          Sem conexão · alterações não serão salvas
        </span>
      )}
    </>
  );
}
