import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { resolveGrantedScope, type WorkspaceLead } from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi, useModule } from '../modules/useModule.js';
import { WhatsAppConnection, type Session } from '../modules/WhatsAppConnection.js';
import { RecordsModule } from '../modules/RecordsModule.js';
import { Composer } from './Composer.js';
import { ConversationHeader } from './ConversationHeader.js';
import { ConversationList } from './ConversationList.js';
import { fixtureConversations, fixtureMessages } from './fixtures.js';
import { LeadPanel } from './LeadPanel.js';
import { MessageThread } from './MessageThread.js';
import type { ChatMessage, ConversationRow, LiveFrame } from './types.js';
import { useWhatsAppEvents } from './useWhatsAppEvents.js';
import './whatsapp.css';

const PreparedMessage = lazy(() =>
  import('../modules/CommunicationModules.js').then((module) => ({ default: module.WhatsAppWorkspace })),
);

function mergeConversations(current: ConversationRow[], incoming: ConversationRow[]) {
  const unchanged =
    current.length === incoming.length &&
    current.every((row, index) => {
      const next = incoming[index];
      return (
        next &&
        row.id === next.id &&
        row.last_at === next.last_at &&
        row.unread_count === next.unread_count &&
        row.status === next.status &&
        row.last_message === next.last_message &&
        row.pending_since === next.pending_since &&
        row.ai_enabled === next.ai_enabled
      );
    });
  if (unchanged) return current;
  const previous = new Map(current.map((row) => [row.id, row]));
  return incoming.map((row) => ({ ...previous.get(row.id), ...row }));
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) map.set(item.id, { ...map.get(item.id), ...item });
  return [...map.values()].sort(
    (a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at) || a.id.localeCompare(b.id),
  );
}

function fileKind(file: File, sticker: boolean) {
  if (sticker && file.type.startsWith('image/')) return 'sticker';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

export function WhatsAppChatWorkspace({
  user,
  leads,
  focusLeadId,
}: {
  user: AuthenticatedSession;
  leads: WorkspaceLead[];
  focusLeadId?: string;
}) {
  const request = useCrmApi(user);
  const templates = useModule('template', user);
  const [session, setSession] = useState<Session>();
  const [conversations, setConversations] = useState<ConversationRow[]>(user.preview ? fixtureConversations : []);
  const [selected, setSelected] = useState(user.preview ? fixtureConversations[0]?.id ?? '' : '');
  const [messages, setMessages] = useState<ChatMessage[]>(user.preview ? fixtureMessages : []);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [day, setDay] = useState<'today' | 'yesterday' | 'all'>('all');
  const [view, setView] = useState<'chat' | 'templates' | 'compose'>('chat');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File>();
  const [asSticker, setAsSticker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unseen, setUnseen] = useState(0);
  const [stickTick, setStickTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [listCollapsed, setListCollapsed] = useState(() => localStorage.getItem('dcfoundry.wa.list') === '1');
  const [panelCollapsed, setPanelCollapsed] = useState(() => localStorage.getItem('dcfoundry.wa.panel') === '1');
  const [panelDrawer, setPanelDrawer] = useState(false);
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1440px)').matches);
  const [phone, setPhone] = useState(() => window.matchMedia('(max-width: 859px)').matches);
  const [foundry, setFoundry] = useState<{ paused: boolean; revision: number; summary: string | null } | null>(null);
  const [foundryBusy, setFoundryBusy] = useState(false);
  const [foundryError, setFoundryError] = useState('');
  const onSession = useCallback((value: Session | undefined) => setSession(value), []);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const stuckRef = useRef(true);
  const onAtBottom = useCallback((value: boolean) => {
    stuckRef.current = value;
    if (value) setUnseen(0);
  }, []);
  const rows = useMemo(
    () =>
      conversations.map((row) => {
        const lead = leads.find((item) => item.id === row.id);
        return {
          ...row,
          name: row.name || lead?.name,
          company: row.company || lead?.company,
          phone: row.phone || lead?.phone,
          created_at: row.created_at || lead?.createdAt,
          scope_summary: row.scope_summary || lead?.scopeSummary,
          campaign: row.campaign || lead?.campaign,
          source: row.source || lead?.campaign || 'WhatsApp',
        };
      }),
    [conversations, leads],
  );
  const active = rows.find((row) => row.id === selected);
  const lead = leads.find((item) => item.id === selected);
  const path = session && selected ? `/api/v1/whatsapp/sessions/${session.id}/leads/${selected}` : '';
  const refreshList = useCallback(async () => {
    if (!session?.id || user.preview) return;
    const data = await request('/api/v1/whatsapp/sessions/' + session.id + '/conversations');
    setConversations((current) => mergeConversations(current, data.items));
  }, [request, session?.id, user.preview]);
  const refreshMessages = useCallback(async () => {
    if (!path || user.preview) return;
    const data = await request(path + '/messages');
    setMessages((current) => {
      const merged = mergeMessages(current.filter((item) => !item.id.startsWith('local-')), data.items);
      const added = data.items.filter((item: ChatMessage) => !current.some((known) => known.id === item.id)).length;
      if (!stuckRef.current && added) setUnseen((count) => count + added);
      return merged;
    });
  }, [path, request, user.preview]);
  useEffect(() => {
    void refreshList().catch((cause) => setError((cause as Error).message));
  }, [refreshList]);
  useEffect(() => {
    setUnseen(0);
    setError('');
    setText('');
    setFile(undefined);
    stuckRef.current = true;
    if (user.preview) {
      setMessages(selected === 'fixture-open' ? fixtureMessages : []);
      return;
    }
    setMessages([]);
    if (path) void refreshMessages().catch((cause) => setError((cause as Error).message));
  }, [path, refreshMessages, selected, user.preview]);
  useEffect(() => {
    if (!selected || user.preview) return;
    const mark = () => {
      if (document.visibilityState === 'hidden' || !path) return;
      void request(path + '/read', { method: 'POST' }).catch(() => undefined);
      setConversations((current) => current.map((row) => (row.id === selected ? { ...row, unread_count: 0 } : row)));
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [path, request, selected, user.preview]);
  const onFrame = useCallback(
    (frame: LiveFrame) => {
      window.dispatchEvent(new Event('crm:whatsapp-changed'));
      if (frame.event === 'message:new' && frame.leadId && frame.leadId === selectedRef.current)
        void refreshMessages();
      void refreshList();
    },
    [refreshList, refreshMessages],
  );
  const online = useWhatsAppEvents(session?.id, user.accessToken, !user.preview, onFrame);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!selected || user.preview) return;
    let stop = false;
    const load = () =>
      void request(`/api/v1/leads/${selected}/foundry`)
        .then((data) => {
          if (!stop) setFoundry({ paused: data.paused, revision: data.revision, summary: data.summary });
        })
        .catch(() => undefined);
    load();
    const timer = setInterval(load, 30000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [request, selected, user.preview, online]);
  useEffect(() => {
    if (!focusLeadId) return;
    if (window.matchMedia('(max-width: 859px)').matches) {
      if (history.state?.waThread) history.replaceState({ waThread: focusLeadId }, '');
      else history.pushState({ waThread: focusLeadId }, '');
    }
    setSelected(focusLeadId);
    setView('chat');
  }, [focusLeadId]);
  useEffect(() => {
    const total = rows.reduce((sum, row) => sum + Number(row.unread_count || 0), 0);
    window.dispatchEvent(new CustomEvent('crm:wa-unread', { detail: total }));
  }, [rows]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1440px)');
    const mobile = window.matchMedia('(max-width: 859px)');
    const sync = () => {
      setWide(media.matches);
      setPhone(mobile.matches);
      document.body.dataset.waThread = mobile.matches && selected ? 'open' : '';
    };
    sync();
    media.addEventListener('change', sync);
    mobile.addEventListener('change', sync);
    return () => {
      media.removeEventListener('change', sync);
      mobile.removeEventListener('change', sync);
      delete document.body.dataset.waThread;
    };
  }, [selected]);
  useEffect(() => {
    const onPop = () => {
      if (window.matchMedia('(max-width: 859px)').matches) setSelected('');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const openConversation = (id: string) => {
    if (window.matchMedia('(max-width: 859px)').matches) {
      if (history.state?.waThread) history.replaceState({ waThread: id }, '');
      else history.pushState({ waThread: id }, '');
    }
    setSelected(id);
    setView('chat');
  };
  const rememberPanel = (collapsed: boolean) => {
    setPanelCollapsed(collapsed);
    localStorage.setItem('dcfoundry.wa.panel', collapsed ? '1' : '0');
  };
  const back = () => {
    if (history.state?.waThread) history.back();
    else setSelected('');
  };
  const send = async () => {
    if (!active || (!text.trim() && !file)) return;
    const draft = text;
    const attachment = file;
    const sticker = asSticker;
    const requestId = crypto.randomUUID();
    const optimistic: ChatMessage = {
      id: requestId,
      body: draft,
      message_type: attachment ? fileKind(attachment, sticker) : 'text',
      direction: 'outbound',
      actor_type: 'human',
      delivery: 'queued',
      sent_at: new Date().toISOString(),
      has_media: Boolean(attachment),
      file_name: attachment?.name ?? null,
      mime_type: attachment?.type || null,
      historical: false,
    };
    setMessages((current) => [...current, optimistic]);
    setText('');
    setFile(undefined);
    setAsSticker(false);
    setError('');
    stuckRef.current = true;
    setStickTick((value) => value + 1);
    if (user.preview || !path) return;
    setBusy(true);
    try {
      let mediaId: string | undefined;
      if (attachment) {
        const base64 = await new Promise<string>((done, reject) => {
          const reader = new FileReader();
          reader.onload = () => done(String(reader.result).split(',')[1] ?? '');
          reader.onerror = () => reject(Error('Não foi possível ler o arquivo.'));
          reader.readAsDataURL(attachment);
        });
        mediaId = (
          await request(path + '/media', {
            method: 'POST',
            body: JSON.stringify({
              name: attachment.name,
              mime: (attachment.type || 'application/octet-stream').split(';')[0],
              base64,
            }),
          })
        ).id;
      }
      await request(path + '/messages', {
        method: 'POST',
        body: JSON.stringify({ text: draft, mediaId, requestId, asSticker: sticker }),
      });
    } catch (cause) {
      setMessages((current) => current.filter((item) => item.id !== requestId));
      setText(draft);
      setFile(attachment);
      setAsSticker(sticker);
      setError((cause as Error).message);
      setBusy(false);
      return;
    }
    try {
      await refreshMessages();
      await refreshList();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const setConversationStatus = async (next: 'open' | 'closed') => {
    if (!path || user.preview) {
      setConversations((current) => current.map((row) => (row.id === selected ? { ...row, status: next } : row)));
      return;
    }
    await request(path + '/conversation', { method: 'PUT', body: JSON.stringify({ status: next }) });
    await refreshList();
  };
  const toggleFoundry = async () => {
    if (!foundry || !selected) return;
    const previous = foundry;
    setFoundry({ ...foundry, paused: !foundry.paused });
    setFoundryBusy(true);
    setFoundryError('');
    try {
      const saved = await request(`/api/v1/leads/${selected}/foundry`, {
        method: 'PUT',
        body: JSON.stringify({ paused: !previous.paused, revision: previous.revision }),
      });
      setFoundry({ paused: saved.paused, revision: saved.revision, summary: previous.summary });
      setConversations((current) =>
        current.map((row) => (row.id === selected ? { ...row, ai_enabled: !saved.paused } : row)),
      );
    } catch (cause) {
      setFoundry(previous);
      setFoundryError((cause as Error).message);
    } finally {
      setFoundryBusy(false);
    }
  };
  const replies = templates.items.map((item) => ({
    id: item.id,
    title: String((item.data as { title?: string }).title ?? 'Resposta'),
    content: String((item.data as { content?: string }).content ?? ''),
  }));
  const connected = session?.status === 'connected';
  return (
    <div
      className="module-workspace wa-inbox"
      data-thread={selected ? 'open' : 'list'}
      data-connected={connected ? 'true' : 'false'}
    >
      <WhatsAppConnection user={user} onSession={onSession} />
      {view !== 'chat' && (
        <div className="wa-view-bar">
          <button type="button" onClick={() => setView('chat')}>
            Voltar para conversas
          </button>
        </div>
      )}
      {view === 'templates' ? (
        <RecordsModule user={user} kind="template" />
      ) : view === 'compose' ? (
        <Suspense fallback={<p role="status">Preparando editor de mensagem…</p>}>
          <PreparedMessage user={user} leads={leads} embedded />
        </Suspense>
      ) : (
        <div className="wa-grid" data-collapsed={phone ? false : listCollapsed} data-panel={wide ? !panelCollapsed : panelDrawer}>
          <ConversationList
            rows={rows}
            selected={selected}
            query={query}
            status={status}
            day={day}
            collapsed={phone ? false : listCollapsed}
            sessionLabel={`${connected ? 'via Baileys · conectado' : 'via Baileys · desconectado'}${online ? '' : ''}`}
            now={now}
            onQuery={setQuery}
            onStatus={setStatus}
            onDay={setDay}
            onToggle={() =>
              setListCollapsed((value) => {
                localStorage.setItem('dcfoundry.wa.list', value ? '0' : '1');
                return !value;
              })
            }
            onSelect={openConversation}
            onCreate={() => window.dispatchEvent(new Event('crm:create-lead'))}
            onTemplates={() => setView('templates')}
            onPrepare={() => setView('compose')}
          />
          <section className="wa-thread" aria-label="Conversa">
            {active ? (
              <>
                <ConversationHeader
                  row={active}
                  now={now}
                  foundry={user.preview ? { paused: !active.ai_enabled } : foundry}
                  foundryBusy={foundryBusy}
                  foundryError={foundryError}
                  canSync={Boolean(resolveGrantedScope(user.roles, 'whatsapp:manage'))}
                  onBack={back}
                  onToggleFoundry={() => void toggleFoundry()}
                  onStatus={() => void setConversationStatus(active.status === 'closed' ? 'open' : 'closed').catch((cause) => setError((cause as Error).message))}
                  onSync={() => {
                    if (session) void request(`/api/v1/whatsapp/sessions/${session.id}/sync`, { method: 'POST', body: '{}' }).catch((cause) => setError((cause as Error).message));
                  }}
                  onPanel={() => (wide ? rememberPanel(false) : setPanelDrawer(true))}
                />
                <MessageThread
                  key={selected}
                  messages={messages}
                  contactName={active.name || 'Contato'}
                  path={path}
                  user={user}
                  preview={user.preview}
                  unseen={unseen}
                  stickTick={stickTick}
                  onAtBottom={onAtBottom}
                  onLoadOlder={async () => {
                    const first = messages[0];
                    if (!path || user.preview || !first) return false;
                    const data = await request(`${path}/messages?before=${encodeURIComponent(first.sent_at)}`);
                    setMessages((current) => mergeMessages(data.items, current));
                    return data.items.length >= 100;
                  }}
                  onJump={() => {
                    stuckRef.current = true;
                    setUnseen(0);
                  }}
                />
                {resolveGrantedScope(user.roles, 'whatsapp:create') || user.preview ? (
                  <Composer
                    text={text}
                    file={file}
                    asSticker={asSticker}
                    closed={active.status === 'closed'}
                    disconnected={!user.preview && !connected}
                    busy={busy}
                    error={error}
                    lead={{ name: active.name || '', company: active.company || '' }}
                    replies={replies}
                    onText={setText}
                    onFile={setFile}
                    onSticker={setAsSticker}
                    onSend={() => void send()}
                    onReopen={() => void setConversationStatus('open')}
                    onConnect={() => document.getElementById('wa-connect-open')?.click()}
                  />
                ) : (
                  <p className="wa-banner">Seu perfil pode ler esta conversa, sem enviar mensagens.</p>
                )}
              </>
            ) : (
              <div className="wa-empty wa-thread-empty">
                <MessageSquare size={36} />
                <h3>Escolha uma conversa</h3>
                <p>As mensagens, a Foundry e a ficha do lead ficam neste painel.</p>
              </div>
            )}
          </section>
          {active && (
            <LeadPanel
              user={user}
              row={active}
              lead={lead}
              summary={foundry?.summary ?? null}
              open={wide ? !panelCollapsed : panelDrawer}
              onClose={() => (wide ? rememberPanel(true) : setPanelDrawer(false))}
            />
          )}
        </div>
      )}
    </div>
  );
}
