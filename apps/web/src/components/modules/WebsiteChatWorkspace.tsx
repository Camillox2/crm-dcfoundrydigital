import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Card } from '@dcfoundry/ui';
import { MessageCircle, Send } from 'lucide-react';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi } from './useModule.js';
import { LeadFoundry } from './FoundryControls.js';
export function WebsiteChatWorkspace({ user }: { user: AuthenticatedSession }) {
  const request = useCrmApi(user),
    [items, setItems] = useState<any[]>([]),
    [selected, setSelected] = useState(''),
    [messages, setMessages] = useState<any[]>([]),
    [leadId, setLeadId] = useState(''),
    [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    if (user.preview) return;
    try {
      const result = await request('/api/v1/website-chat');
      setItems(result.items);
      if (selected) {
        const chat = await request('/api/v1/website-chat/' + selected);
        setMessages(chat.messages);
        setLeadId(chat.leadId);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [request, user.preview, selected]);
  useEffect(() => {
    setMessages([]);
    setLeadId('');
    setText('');
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 3000);
    return () => clearInterval(timer);
  }, [load]);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await request('/api/v1/website-chat/' + selected + '/messages', {
        method: 'POST',
        body: JSON.stringify({ id: crypto.randomUUID(), message: text }),
      });
      setText('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="portal-grid">
        <Card>
          <h2>
            <MessageCircle /> Conversas do site
          </h2>
          <p>Visitantes atendidos pela mesma Foundry e conectados ao funil.</p>
          {items.map((item) => (
            <button
              key={item.id}
              className="portal-ticket"
              aria-pressed={selected === item.id}
              onClick={() => setSelected(item.id)}
            >
              <strong>{item.name}</strong>
              <span>
                {item.path} · {item.ai_paused ? 'Atendimento humano' : 'Foundry ativa'}
              </span>
              <time>{new Date(item.last_message_at).toLocaleString('pt-BR')}</time>
            </button>
          ))}
          {!items.length && (
            <p>
              As conversas aparecerão quando a integração do site estiver configurada e receber uma
              mensagem.
            </p>
          )}
        </Card>
        <Card>
          {selected ? (
            <>
              <h2>Conversa ao vivo</h2>
              <div className="site-chat-messages" role="log" aria-label="Mensagens do site">
                {messages.map((m) => (
                  <article key={m.id} className={'site-chat-message is-' + m.role}>
                    <strong>
                      {m.role === 'contact'
                        ? 'Visitante'
                        : m.role === 'human'
                          ? 'Equipe DC'
                          : 'Foundry IA'}
                    </strong>
                    <p>{m.body}</p>
                    <time>
                      {new Date(m.created_at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </article>
                ))}
              </div>
              <form className="agency-form" onSubmit={send}>
                <label>
                  Resposta da equipe
                  <textarea
                    required
                    value={text}
                    maxLength={4000}
                    onChange={(e) => setText(e.target.value)}
                  />
                </label>
                <p className="agency-help">
                  Responder assume o atendimento e pausa a Foundry neste contato.
                </p>
                <Button disabled={busy}>
                  <Send size={16} /> Enviar resposta humana
                </Button>
              </form>
            </>
          ) : (
            <>
              <MessageCircle size={48} />
              <h2>Da primeira ideia à conversa.</h2>
              <p>Escolha um visitante para acompanhar a conversa ou assumir o atendimento.</p>
            </>
          )}
        </Card>
      </div>
      {error && <p role="alert">{error}</p>}
      {leadId && <LeadFoundry key={leadId} user={user} leadId={leadId} />}
    </>
  );
}
