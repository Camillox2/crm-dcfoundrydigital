import { useEffect, useId, useRef, useState } from 'react';
import { Download, FileText, RefreshCw } from 'lucide-react';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import type { ChatMessage } from './types.js';

const frames: Record<string, string> = {
  image: '18rem 12rem',
  video: '18rem 14rem',
  sticker: '10rem',
  audio: '16rem 4.5rem',
  file: '16rem 2.75rem',
};

export function MessageMedia({
  message,
  path,
  user,
  preview,
}: {
  message: ChatMessage;
  path: string;
  user: AuthenticatedSession;
  preview?: boolean;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const type = message.message_type;
  const size = frames[type] ?? frames.file ?? '16rem 2.75rem';
  const [width, height] = size.split(' ');
  useEffect(() => {
    const node = box.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: '240px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || preview || !message.has_media || !path) return;
    const controller = new AbortController();
    const owned: string[] = [];
    setBusy(true);
    setError('');
    void (async () => {
      try {
        const response = await fetch(`${path}/messages/${message.id}/media`, {
          headers: { Authorization: `Bearer ${user.accessToken}` },
          signal: controller.signal,
        });
        if (!response.ok) throw Error('Não foi possível carregar este anexo');
        const raw = await response.blob();
        const mime = message.mime_type || raw.type;
        const blob = !mime || raw.type === mime ? raw : new Blob([await raw.arrayBuffer()], { type: mime });
        const objectUrl = URL.createObjectURL(blob);
        owned.push(objectUrl);
        if (!controller.signal.aborted) setUrl(objectUrl);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Não foi possível carregar este anexo');
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    })();
    return () => {
      controller.abort();
      for (const item of owned) URL.revokeObjectURL(item);
    };
  }, [visible, preview, message.has_media, message.id, message.mime_type, path, user.accessToken, attempt]);
  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    node?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>('button, a, video, audio')];
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const gif = /gif/i.test(message.mime_type ?? '') || /\.gif$/i.test(message.file_name ?? '');
  const style = { width: width ?? '16rem', height: height ?? width ?? '4rem' };
  return (
    <div className={`wa-media is-${type}`} ref={box} style={style}>
      {preview && (
        <span className="wa-media-fallback">
          {type === 'file' ? <FileText size={18} /> : null}
          {message.file_name || 'Anexo de exemplo'}
        </span>
      )}
      {!preview && url && type === 'image' && (
        <button type="button" className="wa-media-hit" onClick={() => setOpen(true)} aria-label="Ampliar imagem">
          <img src={url} alt={message.body || 'Imagem recebida'} />
        </button>
      )}
      {!preview && url && type === 'sticker' && <img src={url} alt={message.body || 'Figurinha'} />}
      {!preview && url && type === 'video' && (
        <video controls playsInline preload="metadata" loop={gif} muted={gif} src={url} />
      )}
      {!preview && url && type === 'audio' && <audio controls preload="metadata" src={url} aria-label="Áudio da conversa" />}
      {!preview && url && type !== 'image' && type !== 'sticker' && type !== 'video' && type !== 'audio' && (
        <a href={url} download={message.file_name || 'arquivo'}>
          <FileText size={18} />
          <span>{message.file_name || 'Baixar arquivo'}</span>
          <Download size={16} />
        </a>
      )}
      {!preview && !url && (
        <span className="wa-media-fallback">
          {busy ? 'Carregando anexo…' : error || (message.historical ? 'Mídia do histórico não baixada.' : 'Aguardando anexo')}
          {error && (
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>
              <RefreshCw size={14} /> Tentar de novo
            </button>
          )}
        </span>
      )}
      {open && url && (
        <div className="wa-lightbox" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
          <p id={titleId}>Imagem da conversa</p>
          <img src={url} alt={message.body || 'Imagem recebida'} />
          <button type="button" onClick={() => setOpen(false)}>
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}
