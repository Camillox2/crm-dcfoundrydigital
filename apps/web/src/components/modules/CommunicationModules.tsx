import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Check,
  Copy,
  MessageSquare,
  Send,
  Settings,
  Sparkles,
} from 'lucide-react';
import { Button, Card, FoundryMascot } from '@dcfoundry/ui';
import type { WorkspaceLead } from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi, useModule } from './useModule.js';
import { ModuleNotice } from './ModuleTools.js';
import { RecordsModule } from './RecordsModule.js';
import { ContactAvatar } from '../ContactAvatar.js';
import { WhatsAppConnection } from './WhatsAppConnection.js';
import { FoundryLab } from './FoundryControls.js';

export function WhatsAppWorkspace({
  user,
  leads,
  embedded = false,
}: {
  user: AuthenticatedSession;
  leads: WorkspaceLead[];
  embedded?: boolean;
}) {
  const templates = useModule('template', user),
    [tab, setTab] = useState('compose'),
    [selected, setSelected] = useState(''),
    [phone, setPhone] = useState(''),
    [message, setMessage] = useState(''),
    [notice, setNotice] = useState('');
  const contact = leads.find((l) => l.id === selected);
  const ready = phone.replace(/\D/g, '').length >= 10 && message.trim().length > 0;
  const fill = (text: string) =>
    setMessage(
      text
        .replaceAll('{nome}', contact?.name ?? '')
        .replaceAll('{empresa}', contact?.company ?? ''),
    );
  return (
    <div className="module-workspace">
      {!embedded && <WhatsAppConnection user={user} />}
      {!embedded && (
        <div className="module-tabs">
          <button
            aria-pressed={tab === 'compose'}
            onClick={() => {
              templates.reload();
              setTab('compose');
            }}
          >
            Preparar conversa
          </button>
          <button aria-pressed={tab === 'templates'} onClick={() => setTab('templates')}>
            Respostas prontas
          </button>
        </div>
      )}
      {tab === 'templates' ? (
        <RecordsModule kind="template" user={user} />
      ) : (
        <div className="communication-grid">
          <Card className="message-compose">
            <h3>Uma conversa com contexto.</h3>
            <p>Escolha um contato ou informe um número para preparar sua mensagem.</p>
            <label>
              Contato
              <select
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setPhone(leads.find((l) => l.id === e.target.value)?.phone ?? '');
                }}
              >
                <option value="">Informar número manualmente</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · {l.company}
                  </option>
                ))}
              </select>
            </label>
            <label>
              WhatsApp com DDI
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+55 41 99999-9999"
              />
            </label>
            <label>
              Mensagem
              <textarea
                rows={8}
                value={message}
                maxLength={4000}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Olá! Vamos conversar sobre o próximo passo do projeto?"
              />
            </label>
            {notice && <ModuleNotice>{notice}</ModuleNotice>}
            <div className="module-actions">
              <button
                className="module-filter"
                disabled={!message}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(message)
                    .then(() => setNotice('Mensagem copiada.'))
                    .catch(() => setNotice('Selecione o texto para copiar.'));
                }}
              >
                <Copy size={16} />
                Copiar mensagem
              </button>
              <a
                className={`module-primary-link${!ready ? ' is-disabled' : ''}`}
                aria-disabled={!ready}
                href={
                  ready
                    ? `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
                    : undefined
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir no WhatsApp <ArrowUpRight size={17} />
              </a>
            </div>
            <p className="module-footnote">
              O WhatsApp abre com a mensagem preenchida. Você revisa e toca em enviar no aplicativo.
            </p>
          </Card>
          <aside>
            <Card>
              <h3>Respostas da equipe</h3>
              {templates.items.length ? (
                templates.items.map((item) => (
                  <button
                    className="template-choice"
                    key={item.id}
                    onClick={() => fill(String((item.data as any).content))}
                  >
                    <MessageSquare size={16} />
                    <span>{String((item.data as any).title)}</span>
                    <ArrowUpRight size={14} />
                  </button>
                ))
              ) : (
                <p>Crie suas respostas prontas na aba ao lado.</p>
              )}
            </Card>
            {contact && (
              <Card className="communication-contact">
                <ContactAvatar name={contact.name} photoUrl={contact.avatarUrl} />
                <h3>{contact.name}</h3>
                <p>{contact.company}</p>
                <p>{contact.notes || 'Sem notas.'}</p>
              </Card>
            )}
            <Card className="integration-state">
              <span className="integration-status-dot" />
              <strong>Atendimento manual disponível</strong>
              <p>
                Mensagens e fotos recebidas automaticamente dependem de um worker Baileys pareado no
                VPS. Nenhuma sessão é simulada.
              </p>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
export function AssistantWorkspace({ user }: { user: AuthenticatedSession }) {
  const [tab, setTab] = useState('chat'),
    [message, setMessage] = useState(''),
    [messages, setMessages] = useState<{ role: string; content: string; model?: string }[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const request = useCrmApi(user);
  const conversations = useModule('conversation', user);
  const send = async () => {
    if (!message.trim() || busy) return;
    const question = message;
    setBusy(true);
    setError('');
    try {
      const result = await request('/api/v1/workspace/assistant-chat', {
        method: 'POST',
        body: JSON.stringify({ message: question }),
      });
      setMessages((v) => [
        ...v,
        { role: 'user', content: question },
        { role: 'assistant', content: result.answer, model: result.model },
      ]);
      setMessage('');
      conversations.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="module-workspace">
      <div className="module-tabs">
        {[
          ['chat', 'Conversar'],
          ['knowledge', 'Base de conhecimento'],
          ['assistant', 'Orientações'],
          ['history', 'Histórico'],
          ['lab', 'Agente & laboratório'],
        ].map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id!)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'lab' ? (
        <FoundryLab user={user} />
      ) : tab === 'knowledge' || tab === 'assistant' ? (
        <RecordsModule kind={tab} user={user} />
      ) : tab === 'history' ? (
        <div className="conversation-history">
          {conversations.items.length ? (
            conversations.items.map((item) => (
              <Card key={item.id}>
                <button
                  className="text-button"
                  onClick={() => {
                    setMessages((item.data as any).messages);
                    setTab('chat');
                  }}
                >
                  {String((item.data as any).title)}
                </button>
                <small>{new Date(item.updatedAt).toLocaleString('pt-BR')}</small>
              </Card>
            ))
          ) : (
            <Card>Nenhuma conversa salva. As respostas bem-sucedidas aparecem aqui.</Card>
          )}
        </div>
      ) : (
        <Card className="assistant-chat">
          <div className="assistant-chat-heading">
            <FoundryMascot size={64} />
            <div>
              <h3>Vamos pensar no próximo passo?</h3>
              <p>Use o conhecimento cadastrado e as orientações da equipe.</p>
            </div>
          </div>
          <div className="assistant-chat-messages" aria-live="polite">
            {!messages.length ? (
              <div className="assistant-starters">
                {[
                  'Como organizar um briefing de projeto?',
                  'Crie um roteiro para qualificar um lead.',
                  'Sugira uma estrutura para um artigo do blog.',
                ].map((text) => (
                  <button key={text} onClick={() => setMessage(text)}>
                    {text}
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
            ) : (
              messages.map((m, i) => (
                <article key={i} data-role={m.role}>
                  <strong>{m.role === 'user' ? 'Você' : 'Foundry'}</strong>
                  <p>{m.content}</p>
                  {m.model && <small>{m.model}</small>}
                </article>
              ))
            )}
            {busy && <p role="status">O Foundry está organizando a resposta...</p>}
          </div>
          {error && <ModuleNotice error>{error}</ModuleNotice>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label>
              Mensagem para o Foundry
              <textarea
                rows={3}
                value={message}
                maxLength={5000}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Conte o que você precisa resolver..."
              />
            </label>
            <Button type="submit" disabled={busy || !message.trim()}>
              <Send size={16} />
              {busy ? 'Aguarde...' : 'Conversar com Foundry'}
            </Button>
          </form>
          <small className="module-footnote">
            O conteúdo enviado e a base cadastrada são usados como contexto pelo provedor
            configurado. Revise as respostas antes de usá-las.
          </small>
        </Card>
      )}
    </div>
  );
}
