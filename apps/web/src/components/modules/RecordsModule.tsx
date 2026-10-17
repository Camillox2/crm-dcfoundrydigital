import { useState } from 'react';
import { Archive, Check, Edit3, FileText, History, Printer, Send } from 'lucide-react';
import { Badge, Button, Card } from '@dcfoundry/ui';
import {
  moduleSchemas,
  escapeHtml,
  type ModuleKind,
  type WorkspaceDocument,
  type WorkspaceLead,
} from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useModule, downloadCsv } from './useModule.js';
import {
  ModuleDialog,
  ModuleEmpty,
  ModuleNotice,
  ModuleToolbar,
  Pagination,
  RecordHistory,
  flattenRecord,
  money,
  statusLabel,
  useUnsavedChanges,
} from './ModuleTools.js';

type Field = {
  key: string;
  label: string;
  type?: 'textarea' | 'number' | 'currency' | 'date' | 'select';
  options?: string[];
  required?: boolean;
};
const today = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const definitions: Record<
  string,
  {
    label: string;
    empty: string;
    text: string;
    fields: Field[];
    defaults: () => Record<string, unknown>;
  }
> = {
  project: {
    label: 'Novo projeto',
    empty: 'Sua próxima entrega começa aqui.',
    text: 'Vincule o contato, defina escopo, stack, orçamento, datas e progresso.',
    fields: [
      { key: 'title', label: 'Nome do projeto', required: true },
      { key: 'client', label: 'Cliente / empresa', required: true },
      {
        key: 'status',
        label: 'Etapa',
        type: 'select',
        options: ['planning', 'design', 'development', 'review', 'delivered', 'paused'],
      },
      {
        key: 'priority',
        label: 'Prioridade',
        type: 'select',
        options: ['normal', 'high'],
      },
      { key: 'startDate', label: 'Início', type: 'date' },
      { key: 'dueDate', label: 'Entrega prevista', type: 'date' },
      { key: 'progress', label: 'Progresso (%)', type: 'number' },
      { key: 'budgetCents', label: 'Orçamento (R$)', type: 'currency' },
      { key: 'stack', label: 'Tecnologias / stack' },
      { key: 'url', label: 'URL HTTPS do projeto' },
      { key: 'scope', label: 'Escopo e entregas', type: 'textarea' },
      {
        key: 'notes',
        label: 'Próximos passos e observações',
        type: 'textarea',
      },
    ],
    defaults: () => ({
      title: '',
      client: '',
      status: 'planning',
      priority: 'normal',
      startDate: today(),
      dueDate: '',
      progress: 0,
      budgetCents: 0,
      stack: '',
      url: '',
      scope: '',
      notes: '',
    }),
  },
  contract: {
    label: 'Nova proposta',
    empty: 'Seu próximo acordo começa aqui.',
    text: 'Defina escopo, investimento e condições. Registre o andamento e o aceite manual.',
    fields: [
      { key: 'title', label: 'Nome da proposta', required: true },
      { key: 'client', label: 'Cliente / empresa', required: true },
      {
        key: 'valueCents',
        label: 'Investimento (R$)',
        type: 'currency',
        required: true,
      },
      {
        key: 'billing',
        label: 'Modelo',
        type: 'select',
        options: ['project', 'monthly'],
      },
      {
        key: 'status',
        label: 'Etapa',
        type: 'select',
        options: ['draft', 'sent', 'accepted', 'active', 'completed', 'cancelled'],
      },
      { key: 'validUntil', label: 'Válida até', type: 'date' },
      { key: 'scope', label: 'Escopo e entregas', type: 'textarea' },
      { key: 'terms', label: 'Condições comerciais', type: 'textarea' },
    ],
    defaults: () => ({
      title: '',
      client: '',
      valueCents: 0,
      billing: 'project',
      status: 'draft',
      scope: '',
      terms: '',
      validUntil: '',
    }),
  },
  invoice: {
    label: 'Nova cobrança',
    empty: 'Organize o próximo recebimento.',
    text: 'Cadastre cobranças, acompanhe vencimentos e registre recebimentos manuais.',
    fields: [
      { key: 'title', label: 'Descrição', required: true },
      { key: 'client', label: 'Cliente / empresa', required: true },
      {
        key: 'amountCents',
        label: 'Valor (R$)',
        type: 'currency',
        required: true,
      },
      { key: 'dueDate', label: 'Vencimento', type: 'date', required: true },
      {
        key: 'status',
        label: 'Situação',
        type: 'select',
        options: ['open', 'paid', 'cancelled'],
      },
      { key: 'paidAt', label: 'Data do recebimento', type: 'date' },
      {
        key: 'method',
        label: 'Forma de pagamento',
        type: 'select',
        options: ['pix', 'boleto', 'transfer', 'card', 'other'],
      },
      { key: 'notes', label: 'Observações', type: 'textarea' },
    ],
    defaults: () => ({
      title: '',
      client: '',
      amountCents: 0,
      dueDate: today(),
      status: 'open',
      paidAt: '',
      method: 'pix',
      notes: '',
    }),
  },
  task: {
    label: 'Nova tarefa',
    empty: 'Um dia com os próximos passos claros.',
    text: 'Crie lembretes, defina datas e acompanhe o que precisa da sua atenção.',
    fields: [
      { key: 'title', label: 'O que precisa ser feito?', required: true },
      { key: 'dueDate', label: 'Data limite', type: 'date' },
      {
        key: 'priority',
        label: 'Prioridade',
        type: 'select',
        options: ['normal', 'high'],
      },
      {
        key: 'status',
        label: 'Situação',
        type: 'select',
        options: ['open', 'done'],
      },
      { key: 'notes', label: 'Detalhes', type: 'textarea' },
    ],
    defaults: () => ({
      title: '',
      dueDate: today(),
      priority: 'normal',
      status: 'open',
      notes: '',
    }),
  },
  template: {
    label: 'Nova resposta pronta',
    empty: 'As palavras certas, sempre à mão.',
    text: 'Salve mensagens para usar no atendimento. Use {nome} e {empresa} para personalizar.',
    fields: [
      { key: 'title', label: 'Nome da resposta', required: true },
      { key: 'category', label: 'Categoria' },
      { key: 'content', label: 'Mensagem', type: 'textarea', required: true },
    ],
    defaults: () => ({ title: '', category: 'Atendimento', content: '' }),
  },
  campaign: {
    label: 'Adicionar métrica',
    empty: 'Uma visão clara dos seus resultados.',
    text: 'Registre métricas por campanha e data. Seu script pode alimentar o mesmo fluxo depois.',
    fields: [
      { key: 'title', label: 'Nome da campanha', required: true },
      { key: 'campaignId', label: 'ID da campanha', required: true },
      { key: 'account', label: 'ID da conta' },
      { key: 'date', label: 'Data da métrica', type: 'date', required: true },
      {
        key: 'costCents',
        label: 'Investimento (R$)',
        type: 'currency',
        required: true,
      },
      { key: 'impressions', label: 'Impressões', type: 'number' },
      { key: 'clicks', label: 'Cliques', type: 'number' },
      { key: 'conversions', label: 'Conversões informadas', type: 'number' },
    ],
    defaults: () => ({
      title: '',
      campaignId: '',
      account: '',
      date: today(),
      costCents: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      currency: 'BRL',
    }),
  },
  knowledge: {
    label: 'Adicionar conhecimento',
    empty: 'O conhecimento da sua empresa, organizado.',
    text: 'Cadastre serviços, processos e orientações para dar contexto ao Foundry.',
    fields: [
      { key: 'title', label: 'Título', required: true },
      { key: 'category', label: 'Categoria' },
      { key: 'content', label: 'Conteúdo', type: 'textarea', required: true },
    ],
    defaults: () => ({ title: '', category: 'Empresa', content: '' }),
  },
  assistant: {
    label: 'Configurar Foundry',
    empty: 'Um assistente com a voz da sua empresa.',
    text: 'Defina orientações e o tom do Foundry. A chave do provedor fica somente no servidor.',
    fields: [
      { key: 'title', label: 'Nome', required: true },
      {
        key: 'tone',
        label: 'Tom de voz',
        type: 'select',
        options: ['direct', 'friendly', 'technical'],
      },
      {
        key: 'instructions',
        label: 'Orientações do assistente',
        type: 'textarea',
        required: true,
      },
    ],
    defaults: () => ({
      title: 'Foundry',
      tone: 'friendly',
      instructions:
        'Ajude a equipe da DC Foundry Digital com clareza e objetividade. Não invente informações nem execute ações sem revisão humana.',
    }),
  },
};
const optionLabels: Record<string, string> = {
  pix: 'Pix',
  boleto: 'Boleto',
  transfer: 'Transferência',
  card: 'Cartão',
  other: 'Outro',
  direct: 'Direto',
  friendly: 'Próximo e acolhedor',
  technical: 'Técnico',
};
function printable(record: WorkspaceDocument) {
  const d = record.data as Record<string, unknown>,
    win = window.open('', '_blank');
  if (!win) return;
  win.opener = null;
  win.document.write(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(String(d.title))}</title><style>body{font:16px/1.65 system-ui;color:#102a4c;max-width:820px;margin:50px auto;padding:24px}h1{font-size:32px}header{border-bottom:2px solid #1d5fae}section{white-space:pre-wrap;margin:28px 0}small{color:#566779}@media print{button{display:none}}</style></head><body><header><strong>DC Foundry Digital</strong><h1>${escapeHtml(String(d.title))}</h1><p>${escapeHtml(String(d.client ?? ''))}</p></header><section><strong>Investimento:</strong> ${escapeHtml(money(Number(d.valueCents ?? 0)))} · ${escapeHtml(statusLabel[String(d.billing)] ?? '')}</section><h2>Escopo e entregas</h2><section>${escapeHtml(String(d.scope ?? ''))}</section><h2>Condições</h2><section>${escapeHtml(String(d.terms ?? ''))}</section><small>Situação registrada no CRM: ${escapeHtml(statusLabel[String(d.status)] ?? '')}. Este documento não representa assinatura eletrônica.</small><p><button onclick="window.print()">Imprimir / salvar em PDF</button></p></body></html>`,
  );
  win.document.close();
}
export function RecordsModule({
  kind,
  user,
  leads = [],
  compact = false,
}: {
  kind: ModuleKind;
  user: AuthenticatedSession;
  leads?: WorkspaceLead[];
  compact?: boolean;
}) {
  const def = definitions[kind]!;
  const labelStatus = (value: string) =>
    kind === 'project' && value === 'delivered'
      ? 'Entregue'
      : (statusLabel[value] ?? optionLabels[value] ?? value);
  const module = useModule(kind, user);
  const [editing, setEditing] = useState<WorkspaceDocument | null | undefined>(),
    [data, setData] = useState<Record<string, unknown>>({}),
    [leadId, setLeadId] = useState(''),
    [saved, setSaved] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState('all'),
    [history, setHistory] = useState<{ version: number; data: unknown; savedAt: string }[] | null>(
      null,
    );
  const dirty = editing !== undefined && JSON.stringify({ data, leadId }) !== saved;
  useUnsavedChanges(dirty);
  const begin = (record?: WorkspaceDocument) => {
    const d = record ? (record.data as Record<string, unknown>) : def.defaults();
    const link = record?.leadId ?? '';
    setEditing(record ?? null);
    setData(d);
    setLeadId(link);
    setSaved(JSON.stringify({ data: d, leadId: link }));
    setError('');
  };
  const close = () => {
    if (!busy && (!dirty || window.confirm('Sair sem salvar as alterações?')))
      setEditing(undefined);
  };
  const save = async () => {
    const parsed = moduleSchemas[kind].safeParse(data);
    if (!parsed.success) {
      setError(
        `Confira ${def.fields.find((f) => f.key === parsed.error.issues[0]?.path[0])?.label ?? 'os campos'}: ${parsed.error.issues[0]?.message ?? ''}`,
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      await module.save(parsed.data, editing ?? undefined, leadId || null);
      setEditing(undefined);
      setNotice('Alterações salvas no workspace.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const quick = async (record: WorkspaceDocument) => {
    const d = record.data as Record<string, unknown>;
    let next = { ...d };
    if (kind === 'task') next.status = d.status === 'done' ? 'open' : 'done';
    if (kind === 'project') {
      next.status = 'delivered';
      next.progress = 100;
    }
    if (kind === 'invoice') {
      next.status = 'paid';
      next.paidAt = today();
    }
    if (kind === 'contract') next.status = 'sent';
    try {
      await module.save(next, record, record.leadId);
      setNotice(
        kind === 'invoice'
          ? 'Recebimento registrado manualmente. Nenhuma cobrança foi feita ao cliente.'
          : 'Registro atualizado.',
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const filtered = module.items.filter((r) => {
    const d = r.data as Record<string, unknown>;
    return (
      filter === 'all' ||
      (filter === 'overdue'
        ? d.status === 'open' && String(d.dueDate) < today()
        : d.status === filter)
    );
  });
  const totalAmount = module.items
    .filter((r) => (r.data as any).status !== 'cancelled')
    .reduce(
      (sum, r) =>
        sum +
        Number(
          (r.data as any).amountCents ??
            (r.data as any).valueCents ??
            (r.data as any).costCents ??
            0,
        ),
      0,
    );
  return (
    <section
      className={`module-workspace${compact ? ' module-compact' : ''}`}
      aria-label={kind === 'task' ? 'Agenda e tarefas' : def.label}
    >
      {compact && (
        <div className="panel-heading">
          <div>
            <h3>Agenda e próximos passos.</h3>
            <p>O que move o seu dia.</p>
          </div>
        </div>
      )}
      <ModuleToolbar
        query={module.query}
        onQuery={module.setQuery}
        label={def.label}
        onCreate={() => begin()}
        archived={module.archived}
        onArchived={module.setArchived}
        onRefresh={module.reload}
        onExport={() => downloadCsv(`${kind}.csv`, module.items.map(flattenRecord))}
      />
      {['invoice', 'contract', 'campaign'].includes(kind) && (
        <div className="module-summary-grid">
          <Card>
            <small>
              {kind === 'invoice'
                ? 'Cobranças'
                : kind === 'contract'
                  ? 'Propostas e contratos'
                  : 'Investimento registrado'}
            </small>
            <strong>{money(totalAmount)}</strong>
            <span>Registros desta página</span>
          </Card>
          <Card>
            <small>Registros encontrados</small>
            <strong>{module.total}</strong>
            <span>{module.archived ? 'Arquivados' : 'Ativos no workspace'}</span>
          </Card>
          {kind === 'invoice' && (
            <Card>
              <small>A receber nesta página</small>
              <strong>
                {money(
                  module.items
                    .filter((r) => (r.data as any).status === 'open')
                    .reduce((s, r) => s + Number((r.data as any).amountCents), 0),
                )}
              </strong>
              <span>Valores em aberto, inclusive vencidos</span>
            </Card>
          )}
          {kind === 'campaign' && (
            <Card>
              <small>Cliques nesta página</small>
              <strong>
                {module.items
                  .reduce((s, r) => s + Number((r.data as any).clicks), 0)
                  .toLocaleString('pt-BR')}
              </strong>
              <span>Conversões seguem o relatório importado</span>
            </Card>
          )}
        </div>
      )}
      {def.fields.some((f) => f.key === 'status') && (
        <div className="module-tabs" aria-label="Filtrar por situação">
          {[
            'all',
            ...(def.fields.find((f) => f.key === 'status')?.options ?? []),
            ...(kind === 'invoice' ? ['overdue'] : []),
          ].map((s) => (
            <button type="button" key={s} aria-pressed={filter === s} onClick={() => setFilter(s)}>
              {s === 'all' ? 'Todos' : s === 'overdue' ? 'Vencidos' : labelStatus(s)}
            </button>
          ))}
        </div>
      )}
      {(error || module.error) && <ModuleNotice error>{error || module.error}</ModuleNotice>}
      {notice && <ModuleNotice>{notice}</ModuleNotice>}
      {module.loading ? (
        <p role="status">Carregando registros...</p>
      ) : !filtered.length ? (
        <ModuleEmpty
          title={module.query || filter !== 'all' ? 'Nenhum registro neste filtro.' : def.empty}
          text={def.text}
          action={def.label}
          onAction={() => begin()}
        />
      ) : (
        <div className={`record-list${kind === 'project' ? ' ops-project-list' : ''}`}>
          {filtered.map((record) => {
            const d = record.data as Record<string, unknown>;
            return (
              <Card key={record.id} className="record-row">
                <div className="record-row-icon">
                  <FileText size={21} />
                </div>
                <div className="record-row-main">
                  <div>
                    <h3>{String(d.title)}</h3>
                    {Boolean(d.status) && (
                      <Badge tone={d.status === 'paid' || d.status === 'done' ? 'teal' : 'sky'}>
                        {labelStatus(String(d.status))}
                      </Badge>
                    )}
                  </div>
                  <p>
                    {String(
                      d.client ??
                        d.category ??
                        (kind === 'campaign'
                          ? d.date
                          : d.priority === 'high'
                            ? 'Prioridade alta'
                            : ''),
                    )}
                  </p>
                  {Boolean(d.dueDate || d.validUntil) && (
                    <small>
                      {d.dueDate ? 'Prazo / vencimento' : 'Validade'}:{' '}
                      {String(d.dueDate || d.validUntil)}
                    </small>
                  )}
                  {Boolean(d.content || d.instructions) && (
                    <p className="record-snippet">{String(d.content ?? d.instructions)}</p>
                  )}
                  {kind === 'project' && (
                    <div className="ops-project-progress">
                      <span>{Number(d.progress)}% concluído</span>
                      <div
                        role="progressbar"
                        aria-label={`Progresso de ${String(d.title)}`}
                        aria-valuenow={Number(d.progress)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <i style={{ width: `${Number(d.progress)}%` }} />
                      </div>
                      <small>{String(d.stack || 'Stack a definir')}</small>
                      {Boolean(d.scope) && <p>{String(d.scope)}</p>}
                      {Boolean(d.url) && (
                        <a
                          className="text-button"
                          href={String(d.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Abrir projeto ↗
                        </a>
                      )}
                      <strong>{money(Number(d.budgetCents))}</strong>
                    </div>
                  )}
                </div>
                {(d.amountCents !== undefined ||
                  d.valueCents !== undefined ||
                  d.costCents !== undefined) && (
                  <strong className="record-amount">
                    {money(Number(d.amountCents ?? d.valueCents ?? d.costCents))}
                  </strong>
                )}
                <div className="record-actions">
                  {!record.archivedAt && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => begin(record)}>
                        <Edit3 size={14} />
                        Editar
                      </Button>
                      {((kind === 'invoice' && d.status === 'open') ||
                        kind === 'task' ||
                        (kind === 'project' && d.status !== 'delivered') ||
                        (kind === 'contract' && d.status === 'draft')) && (
                        <Button size="sm" onClick={() => void quick(record)}>
                          <Check size={14} />
                          {kind === 'invoice'
                            ? 'Registrar recebimento'
                            : kind === 'task'
                              ? d.status === 'done'
                                ? 'Reabrir'
                                : 'Concluir'
                              : kind === 'project'
                                ? 'Registrar entrega'
                                : 'Marcar como enviada'}
                        </Button>
                      )}
                      {kind === 'contract' && (
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Imprimir ${d.title}`}
                          onClick={() => printable(record)}
                        >
                          <Printer size={16} />
                        </button>
                      )}
                      <button
                        className="icon-button"
                        aria-label={`Histórico de ${d.title}`}
                        onClick={() => {
                          void module
                            .request(`/api/v1/workspace/${kind}/${record.id}/versions`)
                            .then((r) => {
                              begin(record);
                              setHistory(r.items);
                            })
                            .catch((e) => setError(e.message));
                        }}
                      >
                        <History size={16} />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      void module.archive(record).catch((e) => setError(e.message));
                    }}
                  >
                    {record.archivedAt ? 'Restaurar' : 'Arquivar'}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Pagination offset={module.offset} total={module.total} onChange={module.setOffset} />
      {kind === 'invoice' && (
        <p className="module-footnote">
          Registro financeiro manual. Esta tela não movimenta dinheiro nem emite boletos ou Pix.
        </p>
      )}
      {editing !== undefined && (
        <ModuleDialog title={editing ? 'Editar registro' : def.label} onClose={close}>
          <form
            className="module-record-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {error && <ModuleNotice error>{error}</ModuleNotice>}
            {leads.length > 0 && ['task', 'contract', 'invoice', 'project'].includes(kind) && (
              <label>
                Vincular contato
                <select
                  aria-label="Vincular contato"
                  value={leadId}
                  onChange={(e) => {
                    setLeadId(e.target.value);
                    const lead = leads.find((l) => l.id === e.target.value);
                    if (lead && 'client' in data) setData((v) => ({ ...v, client: lead.company }));
                  }}
                >
                  <option value="">Sem vínculo</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.company} · {l.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="module-form-grid">
              {def.fields.map((f) => (
                <label key={f.key} className={f.type === 'textarea' ? 'span-full' : ''}>
                  {f.label}
                  {f.type === 'textarea' ? (
                    <textarea
                      rows={f.key === 'content' || f.key === 'instructions' ? 9 : 4}
                      maxLength={f.key === 'content' ? 24000 : 12000}
                      required={f.required}
                      value={String(data[f.key] ?? '')}
                      onChange={(e) => setData((v) => ({ ...v, [f.key]: e.target.value }))}
                    />
                  ) : f.type === 'select' ? (
                    <select
                      aria-label={f.label}
                      value={String(data[f.key] ?? '')}
                      onChange={(e) => setData((v) => ({ ...v, [f.key]: e.target.value }))}
                    >
                      {f.options?.map((o) => (
                        <option key={o} value={o}>
                          {labelStatus(o)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      required={f.required}
                      type={f.type === 'currency' ? 'number' : (f.type ?? 'text')}
                      min={f.type === 'currency' || f.type === 'number' ? 0 : undefined}
                      step={f.type === 'currency' || f.type === 'number' ? '0.01' : undefined}
                      value={
                        f.type === 'currency'
                          ? Number(data[f.key] ?? 0) / 100
                          : String(data[f.key] ?? '')
                      }
                      onInput={
                        f.type === 'date'
                          ? (e) => {
                              const value = e.currentTarget.value;
                              setData((v) => ({ ...v, [f.key]: value }));
                            }
                          : undefined
                      }
                      onChange={(e) => {
                        const value = e.currentTarget.value;
                        setData((v) => ({
                          ...v,
                          [f.key]:
                            f.type === 'currency'
                              ? Math.round(Number(value) * 100)
                              : f.type === 'number'
                                ? Number(value)
                                : value,
                        }));
                      }}
                    />
                  )}
                </label>
              ))}
            </div>
            {kind === 'contract' && ['accepted', 'active'].includes(String(data.status)) && (
              <p className="workspace-notice">
                O aceite é um registro manual da equipe; não é assinatura eletrônica do cliente.
              </p>
            )}
            {history && (
              <RecordHistory
                items={history}
                onRestore={(value) => {
                  setData(value as Record<string, unknown>);
                  setHistory(null);
                }}
              />
            )}
            <footer className="module-form-footer">
              <button type="button" className="text-button" disabled={busy} onClick={close}>
                Cancelar
              </button>
              <Button type="submit" disabled={busy}>
                <Check size={16} />
                {busy ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </footer>
          </form>
        </ModuleDialog>
      )}
    </section>
  );
}
