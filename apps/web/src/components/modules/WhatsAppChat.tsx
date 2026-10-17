import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Send, Paperclip, Smile, MessageSquare, Download, LoaderCircle } from 'lucide-react';
import { Button, Card } from '@dcfoundry/ui';
import { resolveGrantedScope, type WorkspaceLead } from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi } from './useModule.js';
import { ContactAvatar } from '../ContactAvatar.js';
import { WhatsAppConnection, type Session } from './WhatsAppConnection.js';
import { RecordsModule } from './RecordsModule.js';
import { LeadFoundry } from './FoundryControls.js';
const PreparedMessage = lazy(() =>
  import('./CommunicationModules.js').then((m) => ({ default: m.WhatsAppWorkspace })),
);
type ChatMessage = {
  id: string;
  body: string;
  message_type: string;
  direction: string;
  actor_type: string;
  delivery: string;
  sent_at: string;
  has_media: boolean;
  file_name: string | null;
  mime_type: string | null;
  historical: boolean;
};
function MessageMedia({
  message,
  path,
  user,
}: {
  message: ChatMessage;
  path: string;
  user: AuthenticatedSession;
}) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    objectUrl = useRef('');
  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );
  const load = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${path}/messages/${message.id}/media`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      if (!response.ok) throw Error('Mídia indisponível ou expirada.');
      const blob = await response.blob();
      objectUrl.current = URL.createObjectURL(blob);
      setUrl(objectUrl.current);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="wa-message-media">
      {url ? (
        message.message_type === 'image' || message.message_type === 'sticker' ? (
          <img src={url} alt={message.body || 'Imagem recebida'} loading="lazy" />
        ) : message.message_type === 'audio' ? (
          <audio controls src={url} aria-label="Áudio da conversa" />
        ) : (
          <a href={url} download={message.file_name || 'arquivo'}>
            <Download size={16} />
            {message.file_name || 'Baixar arquivo'}
          </a>
        )
      ) : message.has_media ? (
        <button className="text-button" disabled={busy} onClick={() => void load()}>
          {busy ? <LoaderCircle size={15} /> : <Download size={15} />}Carregar{' '}
          {message.message_type === 'audio'
            ? 'áudio'
            : message.message_type === 'image'
              ? 'imagem'
              : 'arquivo'}
        </button>
      ) : (
        <span className="module-footnote">
          {message.historical
            ? 'Mídia do histórico não baixada.'
            : 'Mídia indisponível no provedor.'}
        </span>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
export function WhatsAppChatWorkspace({
  user,
  leads,
}: {
  user: AuthenticatedSession;
  leads: WorkspaceLead[];
}) {
  const request = useCrmApi(user),
    [session, setSession] = useState<Session>(),
    [selected, setSelected] = useState(''),
    [query, setQuery] = useState(''),
    [tab, setTab] = useState('chat'),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [text, setText] = useState(''),
    [file, setFile] = useState<File>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [photo, setPhoto] = useState<string | null>(null),
    [emoji, setEmoji] = useState(false),
    [online, setOnline] = useState(false);
  const [conversations, setConversations] = useState<
    Array<{
      id: string;
      photoUrl: string | null;
      last_message: string | null;
      last_at: string | null;
    }>
  >([]);
  const conversationByLead = useMemo(
    () =>
      new Map(
        conversations.map((c) => [c.id, { ...c, order: new Date(c.last_at ?? 0).getTime() }]),
      ),
    [conversations],
  );
  const orderedLeads = useMemo(
    () =>
      [...leads].sort(
        (a, b) =>
          (conversationByLead.get(b.id)?.order ?? 0) - (conversationByLead.get(a.id)?.order ?? 0),
      ),
    [leads, conversationByLead],
  );
  const onSession = useCallback((s: Session | undefined) => setSession(s), []),
    contact = leads.find((l) => l.id === selected),
    path = session && contact ? `/api/v1/whatsapp/sessions/${session.id}/leads/${contact.id}` : '';
  const bottom = useRef<HTMLDivElement>(null),
    list = useRef<HTMLDivElement>(null),
    first = useRef(true);
  const reload = useCallback(async () => {
    if (!session?.id || user.preview) return;
    try {
      const contacts = await request('/api/v1/whatsapp/sessions/' + session.id + '/conversations');
      setConversations(contacts.items);
      if (!path) return;
      const data = await request(path + '/messages');
      const nearBottom =
        !list.current ||
        list.current.scrollHeight - list.current.scrollTop - list.current.clientHeight < 100;
      setMessages(data.items);
      setError('');
      const image = await request(path + '/photo');
      setPhoto(image.url);
      if (nearBottom || first.current) {
        first.current = false;
        requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: 'nearest' }));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [path, request, user.preview, session?.id]);
  useEffect(() => {
    first.current = true;
    setMessages([]);
    setPhoto(null);
    setText('');
    setFile(undefined);
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!session?.id || user.preview) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const listen = async () => {
      try {
        const response = await fetch(`/api/v1/whatsapp/sessions/${session.id}/events`, {
          headers: { Authorization: `Bearer ${user.accessToken}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw Error('Canal ao vivo indisponível.');
        setOnline(true);
        const reader = response.body.getReader(),
          decoder = new TextDecoder();
        let buffer = '';
        while (!controller.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (frame.startsWith('data:')) {
              clearTimeout(debounce);
              debounce = setTimeout(() => {
                void reload();
                window.dispatchEvent(new Event('crm:whatsapp-changed'));
                window.dispatchEvent(new Event('crm:leads-changed'));
              }, 120);
            }
          }
        }
        setOnline(false);
      } catch {
        setOnline(false);
      }
      if (!controller.signal.aborted) retry = setTimeout(() => void listen(), 3000);
    };
    void listen();
    return () => {
      controller.abort();
      clearTimeout(retry);
      clearTimeout(debounce);
    };
  }, [session?.id, user.accessToken, user.preview, reload]);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!path) return;
    setBusy(true);
    setError('');
    try {
      let mediaId: string | undefined;
      if (file) {
        if (file.size > 16 * 1024 * 1024) throw Error('O limite por arquivo é 16 MB.');
        const base64 = await new Promise<string>((done, reject) => {
          const reader = new FileReader();
          reader.onload = () => done(String(reader.result).split(',')[1] ?? '');
          reader.onerror = () => reject(Error('Não foi possível ler o arquivo.'));
          reader.readAsDataURL(file);
        });
        mediaId = (
          await request(path + '/media', {
            method: 'POST',
            body: JSON.stringify({
              name: file.name,
              mime: file.type || 'application/octet-stream',
              base64,
            }),
          })
        ).id;
      }
      await request(path + '/messages', {
        method: 'POST',
        body: JSON.stringify({ text, mediaId, requestId: crypto.randomUUID() }),
      });
      setText('');
      setFile(undefined);
      first.current = true;
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const loadOlder = async () => {
    if (!messages[0]) return;
    try {
      const data = await request(
        `${path}/messages?before=${encodeURIComponent(messages[0].sent_at)}`,
      );
      setMessages((previous) => [...data.items, ...previous]);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="module-workspace">
      <WhatsAppConnection user={user} onSession={onSession} />
      <div className="module-tabs">
        <button aria-pressed={tab === 'chat'} onClick={() => setTab('chat')}>
          Conversas ao vivo
        </button>
        <button aria-pressed={tab === 'templates'} onClick={() => setTab('templates')}>
          Respostas prontas
        </button>
        <button aria-pressed={tab === 'compose'} onClick={() => setTab('compose')}>
          Preparar mensagem
        </button>
      </div>
      {tab === 'templates' ? (
        <RecordsModule user={user} kind="template" />
      ) : tab === 'compose' ? (
        <Suspense fallback={<p role="status">Preparando editor de mensagem…</p>}>
          <PreparedMessage user={user} leads={leads} embedded />
        </Suspense>
      ) : (
        <div className="wa-chat-layout">
          <aside className="wa-chat-contacts">
            <label>
              Buscar contato
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nome, empresa ou telefone"
              />
            </label>
            <div>
              {orderedLeads
                .filter((l) =>
                  `${l.name} ${l.company} ${l.phone}`.toLowerCase().includes(query.toLowerCase()),
                )
                .map((lead) => (
                  <button
                    className={lead.id === selected ? 'is-selected' : ''}
                    aria-pressed={lead.id === selected}
                    key={lead.id}
                    onClick={() => setSelected(lead.id)}
                  >
                    <ContactAvatar
                      name={lead.name}
                      photoUrl={
                        lead.id === selected
                          ? photo
                          : (conversationByLead.get(lead.id)?.photoUrl ?? lead.avatarUrl)
                      }
                    />
                    <span>
                      <strong>{lead.name}</strong>
                      <small>{conversationByLead.get(lead.id)?.last_message || lead.company}</small>
                    </span>
                  </button>
                ))}
              {!leads.length && <p>Os contatos recebidos pelo WhatsApp aparecem no funil.</p>}
            </div>
          </aside>
          <Card className="wa-chat-panel">
            {contact ? (
              <>
                <header>
                  <ContactAvatar name={contact.name} photoUrl={photo} />
                  <div>
                    <h3>{contact.name}</h3>
                    <small>
                      {contact.phone} ·{' '}
                      {online ? 'Atualização ao vivo' : 'Reconectando atualizações'}
                    </small>
                  </div>
                  <a
                    className="text-button"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`}
                  >
                    Abrir no aplicativo ↗
                  </a>
                </header>
                <LeadFoundry user={user} leadId={contact.id} />
                <div className="wa-message-list" ref={list} aria-label="Mensagens da conversa">
                  <button
                    className="text-button"
                    disabled={!messages.length}
                    onClick={() => void loadOlder()}
                  >
                    Carregar anteriores
                  </button>
                  {messages.length ? (
                    messages.map((message) => (
                      <article
                        className={`wa-bubble ${message.direction === 'outbound' ? 'is-outgoing' : ''}`}
                        key={message.id}
                      >
                        <span className="wa-author">
                          {message.actor_type === 'foundry'
                            ? 'Foundry IA'
                            : message.direction === 'outbound'
                              ? 'Equipe'
                              : contact.name}
                          {message.historical ? ' · Histórico' : ''}
                        </span>
                        {message.body && <p>{message.body}</p>}
                        {message.message_type !== 'text' && (
                          <MessageMedia message={message} path={path} user={user} />
                        )}
                        <small>
                          {new Date(message.sent_at).toLocaleString('pt-BR')}
                          {message.direction === 'outbound'
                            ? ' · ' +
                              ({
                                queued: 'Na fila',
                                sent: 'Enviada',
                                delivered: 'Entregue',
                                read: 'Lida',
                                failed: 'Falhou',
                              }[message.delivery] ?? message.delivery)
                            : ''}
                        </small>
                      </article>
                    ))
                  ) : (
                    <p className="wa-chat-empty">
                      Inicie a conversa ou aguarde uma mensagem recebida.
                    </p>
                  )}
                  <div ref={bottom} />
                </div>
                {error && <p role="alert">{error}</p>}
                <form className="wa-compose" onSubmit={(event) => void send(event)}>
                  <label className="sr-only" htmlFor="wa-message">
                    Mensagem
                  </label>
                  <textarea
                    id="wa-message"
                    rows={2}
                    maxLength={10000}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Escreva para o cliente…"
                  />
                  <div className="wa-compose-tools">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Inserir emoji"
                      onClick={() => setEmoji((v) => !v)}
                    >
                      <Smile size={18} />
                    </button>
                    <label className="wa-attachment">
                      <Paperclip size={18} />
                      <span>Anexar</span>
                      <input type="file" onChange={(e) => setFile(e.target.files?.[0])} />
                    </label>
                    {file && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setFile(undefined)}
                      >
                        {file.name} ×
                      </button>
                    )}
                    <Button
                      type="submit"
                      disabled={
                        busy ||
                        !session ||
                        session.status !== 'connected' ||
                        (!text.trim() && !file) ||
                        !resolveGrantedScope(user.roles, 'whatsapp:create')
                      }
                    >
                      <Send size={16} />
                      {busy ? 'Enviando…' : 'Enviar'}
                    </Button>
                  </div>
                  {emoji && (
                    <div className="wa-emoji">
                      {['🙂', '👍', '👋', '🚀', '✅', '💡', '📅', '💻'].map((value) => (
                        <button
                          type="button"
                          key={value}
                          onClick={() => setText((previous) => previous + value)}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  )}
                </form>
              </>
            ) : (
              <div className="wa-chat-empty">
                <MessageSquare size={40} />
                <h3>Conversas que viram projetos.</h3>
                <p>Escolha um contato para acompanhar o histórico e conversar com contexto.</p>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
