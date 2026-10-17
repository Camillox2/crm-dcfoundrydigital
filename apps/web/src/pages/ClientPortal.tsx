import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Card } from '@dcfoundry/ui';
import { FileSignature, LifeBuoy, Link as LinkIcon } from 'lucide-react';
import type { WorkspaceLead } from '@dcfoundry/shared';
import type { AuthenticatedSession } from './LoginPage.js';
import { useCrmApi } from '../components/modules/useModule.js';
import { money } from '../components/modules/ModuleTools.js';
type Requester = (path: string, init?: RequestInit) => Promise<any>;
type Ticket = {
  id: string;
  title: string;
  kind: string;
  description: string;
  status: string;
  version: number;
  updated_at: string;
};
const labels: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting_client: 'Aguardando cliente',
  resolved: 'Resolvido',
  cancelled: 'Cancelado',
  adjustment: 'Ajuste',
  support: 'Suporte',
  maintenance: 'Manutenção',
  sent: 'Enviada',
  accepted: 'Aceita',
  active: 'Ativa',
  completed: 'Concluída',
  issued: 'Aguardando assinatura',
  client_signed: 'Cliente assinou',
  signed: 'Assinado',
  paid: 'Recebida',
};
export function ServiceRequestPanel({
  request,
  base,
  items,
  onChange,
  staff = false,
}: {
  request: Requester;
  base: string;
  items: Ticket[];
  onChange: () => Promise<void>;
  staff?: boolean;
}) {
  const [selected, setSelected] = useState<any>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const open = async (id: string) => {
    try {
      setError('');
      setSelected(await request(base.replace(/\/requests$/, '') + '/requests/' + id));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const create = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      const result = await request(base, {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(data)),
      });
      form.reset();
      await onChange();
      await open(result.item.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const respond = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form);
    setBusy(true);
    try {
      await request(base.replace(/\/requests$/, '') + '/requests/' + selected.item.id + '/events', {
        method: 'POST',
        body: JSON.stringify({
          message: data.get('message'),
          version: selected.item.version,
          ...(staff ? { status: data.get('status') } : {}),
        }),
      });
      form.reset();
      await onChange();
      await open(selected.item.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="portal-grid">
      <Card>
        <h2>
          <LifeBuoy size={22} /> Solicitações de serviço
        </h2>
        <p>Ajustes, suporte e manutenção com histórico de cada conversa.</p>
        {items.map((item) => (
          <button className="portal-ticket" key={item.id} onClick={() => void open(item.id)}>
            <strong>{item.title}</strong>
            <span>
              {labels[item.kind]} · {labels[item.status]}
            </span>
          </button>
        ))}
        {!items.length && <p>Nenhuma solicitação por aqui ainda.</p>}
        <form className="agency-form" onSubmit={create}>
          <h3>Nova solicitação</h3>
          <label>
            Título
            <input name="title" required minLength={3} maxLength={180} />
          </label>
          <label>
            Tipo
            <select name="kind">
              <option value="adjustment">Ajuste</option>
              <option value="support">Suporte</option>
              <option value="maintenance">Manutenção</option>
            </select>
          </label>
          <label>
            O que você precisa?
            <textarea name="description" required minLength={5} maxLength={10000} />
          </label>
          <Button disabled={busy}>Criar solicitação</Button>
        </form>
      </Card>
      <Card>
        {selected ? (
          <>
            <h2>{selected.item.title}</h2>
            <span className="portal-status">
              {labels[selected.item.status]} · versão {selected.item.version}
            </span>
            <ol className="request-timeline">
              {selected.events.map((event: any) => (
                <li key={event.id}>
                  <strong>{event.actor_type === 'client' ? 'Cliente' : 'Equipe DC'}</strong>
                  <time>{new Date(event.created_at).toLocaleString('pt-BR')}</time>
                  <p>{event.message}</p>
                  <small>{labels[event.status]}</small>
                </li>
              ))}
            </ol>
            <form className="agency-form" onSubmit={respond}>
              {staff && (
                <label>
                  Status
                  <select
                    name="status"
                    defaultValue={selected.item.status}
                    key={selected.item.version}
                  >
                    {['open', 'in_progress', 'waiting_client', 'resolved', 'cancelled'].map((s) => (
                      <option key={s} value={s}>
                        {labels[s]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Adicionar mensagem
                <textarea name="message" required maxLength={10000} />
              </label>
              <Button disabled={busy}>Registrar na linha do tempo</Button>
            </form>
          </>
        ) : (
          <>
            <LifeBuoy size={48} />
            <h2>Todo detalhe tem um caminho.</h2>
            <p>Abra uma solicitação para acompanhar as respostas e as próximas etapas.</p>
          </>
        )}
      </Card>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function ClientPortal() {
  const token = location.pathname.split('/').pop() ?? '',
    base = '/api/public/portal/' + encodeURIComponent(token),
    [data, setData] = useState<any>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const request = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(path, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      }),
      body = await res.json();
    if (!res.ok) throw new Error(body.message ?? 'Não foi possível abrir este link.');
    return body;
  }, []);
  const load = useCallback(async () => {
    try {
      setData(await request(base));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [request, base]);
  useEffect(() => {
    void load();
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.append(meta);
    return () => meta.remove();
  }, [load]);
  const accept = async (e: FormEvent<HTMLFormElement>, proposal: any) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await request(base + '/proposals/' + proposal.id + '/accept', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          version: proposal.version,
          accepted: form.get('accepted') === 'on',
        }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="client-portal">
      <header className="portal-hero">
        <span>DC FOUNDRY DIGITAL · PORTAL DO CLIENTE</span>
        <h1>
          Seu projeto.
          <br />
          <em>Mais perto de você.</em>
        </h1>
        <p>
          {data
            ? 'Olá, ' + data.client.name + '. Acompanhe aprovações, documentos e atendimento.'
            : 'Abrindo seu espaço…'}
        </p>
        <svg viewBox="0 0 400 100" aria-hidden="true">
          <path
            d="M0 70 Q100 20 200 65 T400 45"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            pathLength="1"
          />
        </svg>
      </header>
      {error && (
        <p className="workspace-notice" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <div className="portal-grid">
            <Card>
              <h2>
                <FileSignature /> Propostas
              </h2>
              {!data.proposals.length && <p>As propostas enviadas aparecerão aqui.</p>}
              {data.proposals.map((p: any) => (
                <article className="portal-document" key={p.id}>
                  <h3>{p.title}</h3>
                  <strong>{money(Number(p.value_cents))}</strong>
                  <span>
                    {labels[p.status]} · versão {p.version}
                  </span>
                  <p className="preserve-text">{p.scope}</p>
                  <details>
                    <summary>Condições da proposta</summary>
                    <p className="preserve-text">{p.terms}</p>
                  </details>
                  {p.status === 'sent' && (
                    <form className="agency-form" onSubmit={(e) => void accept(e, p)}>
                      <label>
                        Seu nome completo
                        <input name="name" required minLength={2} maxLength={180} />
                      </label>
                      <label className="check-label">
                        <input type="checkbox" name="accepted" required />
                        Li o escopo e as condições desta versão e aceito a proposta.
                      </label>
                      <Button disabled={busy}>Aceitar esta versão</Button>
                    </form>
                  )}
                </article>
              ))}
            </Card>
            <Card>
              <h2>Contratos & cobranças</h2>
              {data.contracts.map((c: any) => (
                <article className="portal-document" key={c.id}>
                  <h3>{c.title}</h3>
                  <p>{labels[c.status]}</p>
                  {c.signaturePath ? (
                    <a href={c.signaturePath}>Ler contrato e assinaturas →</a>
                  ) : (
                    <p>Solicite à equipe um link de assinatura atualizado.</p>
                  )}
                </article>
              ))}
              {data.charges.map((c: any) => (
                <article className="portal-document" key={c.id}>
                  <h3>{c.title}</h3>
                  <strong>{money(Number(c.amount_cents))}</strong>
                  <p>
                    Vencimento: {c.due_date} · {labels[c.status] ?? 'Em aberto'}
                  </p>
                  {c.receipt && (
                    <details>
                      <summary>Recibo</summary>
                      <p className="preserve-text">{c.receipt}</p>
                    </details>
                  )}
                </article>
              ))}
              {!data.contracts.length && !data.charges.length && (
                <p>Os documentos e cobranças serão exibidos quando emitidos.</p>
              )}
            </Card>
          </div>
          <ServiceRequestPanel
            request={request}
            base={base + '/requests'}
            items={data.requests}
            onChange={load}
          />
          <footer>
            Acesso pessoal por link · válido até{' '}
            {new Date(data.expiresAt).toLocaleDateString('pt-BR')}. Não compartilhe este endereço.
          </footer>
        </>
      )}
    </main>
  );
}
export function ClientPortalWorkspace({
  user,
  leads,
}: {
  user: AuthenticatedSession;
  leads: WorkspaceLead[];
}) {
  const request = useCrmApi(user),
    [leadId, setLeadId] = useState(''),
    [items, setItems] = useState<Ticket[]>([]),
    [url, setUrl] = useState(''),
    [linkId, setLinkId] = useState(''),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!leadId) return;
    try {
      setItems((await request('/api/v1/leads/' + leadId + '/requests')).items);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [request, leadId]);
  useEffect(() => {
    setItems([]);
    setUrl('');
    setLinkId('');
    void load();
  }, [load]);
  const ticketRequest: Requester = useCallback(
    (path, init) =>
      request(path.replace('/api/v1/leads/' + leadId + '/requests/', '/api/v1/requests/'), init),
    [request, leadId],
  );
  return (
    <>
      <Card>
        <h2>Um espaço para cada cliente</h2>
        <p>Compartilhe um link de 30 dias para documentos, aprovações e solicitações.</p>
        <label>
          Cliente
          <select value={leadId} onChange={(e) => setLeadId(e.target.value)}>
            <option value="">Escolha um contato</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {l.company}
              </option>
            ))}
          </select>
        </label>
        {leadId && (
          <Button
            onClick={async () => {
              try {
                const result = await request('/api/v1/leads/' + leadId + '/portal', {
                  method: 'POST',
                });
                setUrl(location.origin + result.path);
                setLinkId(result.id);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LinkIcon size={16} /> Gerar link do portal
          </Button>
        )}
        {url && (
          <div className="portal-share">
            <a href={url} target="_blank" rel="noreferrer">
              Abrir portal do cliente →
            </a>
            <input
              aria-label="Link do portal"
              value={url}
              readOnly
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await request('/api/v1/leads/' + leadId + '/portal/' + linkId, {
                    method: 'DELETE',
                  });
                  setUrl('');
                  setLinkId('');
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Revogar este link
            </Button>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </Card>
      {leadId && (
        <ServiceRequestPanel
          key={leadId}
          request={ticketRequest}
          base={'/api/v1/leads/' + leadId + '/requests'}
          items={items}
          onChange={load}
          staff
        />
      )}
    </>
  );
}
