import { useEffect, useId, useState, useMemo } from 'react';
import {
  ArrowRight,
  RefreshCw,
  TrendingUp,
  Wallet,
  Users,
  ListChecks,
  Globe,
  BookOpen,
  Layers,
} from 'lucide-react';
import { Card, Mark, Button } from '@dcfoundry/ui';
import {
  buildOperationsReport,
  reportCsvRows,
  type OperationsReport,
  type WorkspacePage,
  type WorkspaceLead,
} from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi } from './useModule.js';
import { CsvExport } from './CsvExport.js';
import { money, ModuleNotice, statusLabel } from './ModuleTools.js';
import {SlaPanel} from './SlaPanel.js';

const count = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const shortDate = (d: string) =>
  d
    ? new Date(d + 'T12:00:00Z').toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      })
    : 'Sem prazo';
const stageLabels: Record<string, string> = {
  novo: 'Novos',
  qualificado_ia: 'Qualificados',
  orcamento: 'Em proposta',
  contrato_ativo: 'Clientes ativos',
};
const empty = (days: number) =>
  buildOperationsReport({
    leads: [],
    documents: [],
    events: [],
    days,
    access: {
      lead: true,
      invoice: true,
      contract: true,
      task: true,
      project: true,
      blog: true,
      campaign: true,
      site: true,
    },
  });

export function useOperationsReport(user: AuthenticatedSession, days = 30) {
  const request = useCrmApi(user);
  const [report, setReport] = useState<OperationsReport | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const changed = () => setRevision((v) => v + 1);
    window.addEventListener('crm:records-changed', changed);
    return () => window.removeEventListener('crm:records-changed', changed);
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError('');
    setReport(null);
    if (user.preview) {
      setReport(empty(days));
      setLoading(false);
      return;
    }
    request(`/api/v1/workspace/report?days=${days}`, { signal: c.signal })
      .then((value) => {
        if (!c.signal.aborted) setReport(value);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [request, user.preview, days, revision]);
  return { report, loading, error, reload: () => setRevision((v) => v + 1) };
}

type Series = { date: string; [key: string]: number | string }[];
function TrendChart({
  title,
  description,
  rows,
  lines,
  currency = false,
  availabilityKey,
}: {
  title: string;
  description: string;
  rows: Series;
  lines: { key: string; label: string; color: string }[];
  currency?: boolean;
  availabilityKey?: string;
}) {
  const uid = useId();
  const max = Math.max(
    currency ? 100 : 1,
    ...rows.flatMap((row) => lines.map((line) => Number(row[line.key] ?? 0))),
  );
  const available = (row: Series[number]) => !availabilityKey || Number(row[availabilityKey]) > 0;
  const hasData = availabilityKey
    ? rows.some(available)
    : rows.some((row) => lines.some((line) => Number(row[line.key]) > 0));
  const format = (v: number) => (currency ? money(v) : count(v));
  return (
    <Card className="ops-chart">
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <TrendingUp size={18} />
      </div>
      {hasData ? (
        <>
          <div className="ops-line-chart">
            <svg viewBox="0 0 620 220" role="img" aria-labelledby={uid}>
              <title id={uid}>
                {title}. {description}. Valores exatos na tabela abaixo.
              </title>
              {[0, 0.5, 1].map((f) => (
                <g key={f}>
                  <line
                    x1="76"
                    x2="608"
                    y1={178 - f * 146}
                    y2={178 - f * 146}
                    stroke="var(--border-color)"
                  />
                  <text x="66" y={182 - f * 146} textAnchor="end">
                    {format(max * f)}
                  </text>
                </g>
              ))}
              {lines.map((line) => (
                <g key={line.key}>
                  <path
                    className="ops-line"
                    pathLength={1}
                    fill="none"
                    stroke={line.color}
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    d={rows
                      .map((row, i) =>
                        available(row)
                          ? `${i > 0 && available(rows[i - 1]!) ? 'L' : 'M'}${76 + (i / Math.max(1, rows.length - 1)) * 532},${178 - (Number(row[line.key] ?? 0) / max) * 146}`
                          : '',
                      )
                      .join(' ')}
                  />
                  {availabilityKey &&
                    rows.map((row, i) =>
                      available(row) ? (
                        <circle
                          key={row.date}
                          cx={76 + (i / Math.max(1, rows.length - 1)) * 532}
                          cy={178 - (Number(row[line.key] ?? 0) / max) * 146}
                          r="3"
                          fill={line.color}
                        />
                      ) : null,
                    )}
                </g>
              ))}
              <text x="76" y="207">
                {shortDate(rows[0]?.date ?? '')}
              </text>
              <text x="608" y="207" textAnchor="end">
                {shortDate(rows.at(-1)?.date ?? '')}
              </text>
            </svg>
          </div>
          <div className="ops-legend">
            {lines.map((line) => (
              <span key={line.key}>
                <i style={{ background: line.color }} />
                {line.label}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="ops-chart-empty">
          <TrendingUp size={30} />
          <strong>A série começa com os seus registros.</strong>
          <span>Nenhum valor registrado neste período.</span>
        </div>
      )}
      <details className="ops-values">
        <summary>Ver valores por dia</summary>
        <div className="ops-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                {lines.map((l) => (
                  <th key={l.key}>{l.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date}>
                  <td>{shortDate(row.date)}</td>
                  {lines.map((l) => (
                    <td key={l.key}>
                      {available(row) ? format(Number(row[l.key] ?? 0)) : 'Sem registro'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
function Bars({
  title,
  description,
  rows,
  onClick,
  currency = false,
}: {
  title: string;
  description: string;
  rows: { label: string; value: number; key?: string }[];
  onClick?: () => void;
  currency?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card className="ops-chart">
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <div className="ops-bars">
        {rows.map((r, i) => (
          <div key={r.key ?? r.label} className="ops-bar">
            <div>
              <span>{r.label}</span>
              <strong>{currency ? money(r.value) : count(r.value)}</strong>
            </div>
            <div className="ops-bar-track">
              <span
                style={{
                  width: `${(r.value / max) * 100}%`,
                  animationDelay: `${i * 65}ms`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      {!rows.length && <p className="ops-empty-copy">Nenhum registro disponível.</p>}
      {onClick && (
        <button className="text-button" onClick={onClick}>
          Ver registros <ArrowRight size={15} />
        </button>
      )}
    </Card>
  );
}
function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Users;
}) {
  return (
    <Card className="ops-metric">
      <div>
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <strong>{value.replaceAll('\u00a0', ' ')}</strong>
      <small>{detail}</small>
    </Card>
  );
}
export function OperationsDashboard({
  user,
  onNavigate,
  leads = [],
  onOpenLead,
  full = false,
}: {
  user: AuthenticatedSession;
  onNavigate: (page: WorkspacePage) => void;
  leads?: WorkspaceLead[];
  onOpenLead?: (lead: WorkspaceLead) => void;
  full?: boolean;
}) {
  const [days, setDays] = useState(30),
    [view, setView] = useState('commercial');
  const { report: r, loading, error, reload } = useOperationsReport(user, days);
  const views = r
    ? [
        { id: 'commercial', label: 'Comercial', show: r.access.lead },
        { id: 'finance', label: 'Financeiro', show: r.access.invoice },
        { id: 'marketing', label: 'Marketing & Ads', show: r.access.campaign },
        { id: 'content', label: 'Blog & conteúdo', show: r.access.blog },
        { id: 'site', label: 'Site', show: r.access.site },
      ].filter((v) => v.show)
    : [];
  const selected = views.some((v) => v.id === view) ? view : views[0]?.id;
  const exportView = full ? (selected ?? 'daily') : 'daily';
  const exportRows = useMemo(() => (r ? reportCsvRows(r, exportView) : []), [r, exportView]);
  const exportLabel =
    (
      {
        marketing: 'Exportar campanhas',
        content: 'Exportar artigos',
        site: 'Exportar páginas',
        finance: 'Exportar fluxo',
        commercial: 'Exportar entradas',
      } as Record<string, string>
    )[exportView] ?? 'Exportar série';
  return (
    <div className="ops-dashboard">
      <SlaPanel user={user}/>
      <section className="ops-heading">
        <div>
          <h2>
            {full ? (
              <>
                Resultados para <Mark>decidir.</Mark>
              </>
            ) : (
              <>
                Sua operação, <Mark>conectada.</Mark>
              </>
            )}
          </h2>
          <p>
            {full
              ? 'Comercial, financeiro, conteúdo e aquisição em uma visão comum.'
              : 'O que mudou no período e o que precisa da sua atenção hoje.'}
          </p>
        </div>
        <div className="ops-controls">
          <label>
            Período
            <select
              aria-label="Período do relatório"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </select>
          </label>
          <button
            className="icon-button"
            onClick={reload}
            aria-label="Atualizar indicadores"
            disabled={loading}
          >
            <RefreshCw size={17} />
          </button>
          <CsvExport
            name={`relatorio-${exportView}-${r?.period.from}-${r?.period.to}.csv`}
            rows={exportRows}
            label={exportLabel}
            disabled={!r || loading}
          />
        </div>
      </section>
      {user.preview && (
        <ModuleNotice>
          Prévia local sem dados. Conecte a API para acompanhar a operação.
        </ModuleNotice>
      )}
      {error && (
        <ModuleNotice error>
          {error}{' '}
          <button className="text-button" onClick={reload}>
            Tentar novamente
          </button>
        </ModuleNotice>
      )}
      {loading && (
        <div className="ops-loading" role="status">
          Reunindo indicadores do workspace…
        </div>
      )}
      {r && (
        <>
          {r.truncated && (
            <ModuleNotice error>
              Este relatório atingiu o limite de 10 mil registros de uma fonte. Os totais são
              parciais; exporte pela fonte para uma análise completa.
            </ModuleNotice>
          )}
          <div className="ops-date-caption">
            {shortDate(r.period.from)} a {shortDate(r.period.to)} · Horário de Brasília · Somente
            registros ativos e permitidos ao seu perfil
          </div>
          <div className="ops-kpis">
            {r.access.lead && (
              <>
                <Metric
                  label="Novas oportunidades"
                  value={count(r.totals.newLeads)}
                  detail={`${count(r.totals.previousLeads)} no período anterior de ${days} dias`}
                  icon={Users}
                />
                <Metric
                  label="Pipeline qualificado"
                  value={money(r.totals.pipelineCents)}
                  detail="Valores atuais em qualificação e proposta; não é receita"
                  icon={Layers}
                />
              </>
            )}
            {r.access.invoice && (
              <Metric
                label="Recebido no período"
                value={money(r.totals.receivedCents)}
                detail={`${money(r.totals.previousReceivedCents)} no período anterior; baixa manual`}
                icon={Wallet}
              />
            )}
            {r.access.task && (
              <Metric
                label="Tarefas em aberto"
                value={count(r.totals.openTasks)}
                detail={`${r.totals.overdueTasks} atrasadas · posição atual`}
                icon={ListChecks}
              />
            )}
          </div>
          {full && (
            <div className="module-tabs ops-tabs" aria-label="Área do relatório">
              {views.map((v) => (
                <button key={v.id} aria-pressed={selected === v.id} onClick={() => setView(v.id)}>
                  {v.label}
                </button>
              ))}
            </div>
          )}
          {(!full || selected === 'commercial') && r.access.lead && (
            <div className="ops-chart-grid">
              <TrendChart
                title="Entrada de oportunidades"
                description="Novos cadastros por dia, incluindo dias sem entradas."
                rows={r.series}
                lines={[{ key: 'leads', label: 'Oportunidades', color: '#246ba5' }]}
              />
              <Bars
                title="Onde os negócios estão"
                description="Distribuição atual por etapa; não representa uma taxa histórica de conversão."
                rows={r.funnel.map((row) => ({
                  label: row.stageName??stageLabels[row.stage]??row.stage,
                  value: row.count,
                }))}
                onClick={() => onNavigate('kanban')}
              />
              {full && (
                <Bars
                  title="Origem informada dos contatos"
                  description="Campo de origem/campanha do cadastro. Ausências permanecem identificadas."
                  rows={r.origins.map((row) => ({
                    label: row.label,
                    value: row.count,
                  }))}
                  onClick={() => onNavigate('kanban')}
                />
              )}
            </div>
          )}
          {full && selected === 'finance' && r.access.invoice && (
            <>
              <div className="ops-kpis">
                <Metric
                  label="A receber"
                  value={money(r.totals.openCents)}
                  detail="Todas as cobranças abertas, incluindo atrasadas"
                  icon={Wallet}
                />
                <Metric
                  label="Vencido"
                  value={money(r.totals.overdueCents)}
                  detail={`${r.totals.overdueInvoices} cobranças em atraso hoje`}
                  icon={Wallet}
                />
              </div>
              <div className="ops-chart-grid">
                <TrendChart
                  title="Recebimentos e vencimentos"
                  description="Recebido pela data da baixa; vencimentos incluem cobranças recebidas e abertas. Canceladas excluídas."
                  rows={r.series}
                  currency
                  lines={[
                    {
                      key: 'receivedCents',
                      label: 'Recebido',
                      color: '#278676',
                    },
                    { key: 'dueCents', label: 'Vencimento', color: '#246ba5' },
                  ]}
                />
                <Bars
                  title="Posição das cobranças"
                  description="Retrato atual, independente do período selecionado. Valores em reais."
                  currency
                  rows={[
                    {
                      label: 'Em dia, a receber',
                      value: r.totals.openCents - r.totals.overdueCents,
                    },
                    { label: 'Vencidas', value: r.totals.overdueCents },
                  ]}
                  onClick={() => onNavigate('finance')}
                />
              </div>
            </>
          )}
          {full && selected === 'marketing' && r.access.campaign && (
            <>
              <div className="ops-kpis">
                <Metric
                  label="Investimento"
                  value={money(r.totals.costCents)}
                  detail="Métricas diárias importadas ou cadastradas"
                  icon={Wallet}
                />
                <Metric
                  label="Cliques / impressões"
                  value={`${count(r.totals.clicks)} / ${count(r.totals.impressions)}`}
                  detail={`CTR: ${r.totals.ctr === null ? '—' : count(r.totals.ctr) + '%'}`}
                  icon={TrendingUp}
                />
                <Metric
                  label="CPC médio"
                  value={r.totals.cpcCents === null ? '—' : money(r.totals.cpcCents)}
                  detail="Investimento ÷ cliques do período"
                  icon={TrendingUp}
                />
                <Metric
                  label="Custo por conversão"
                  value={r.totals.cpaCents === null ? '—' : money(r.totals.cpaCents)}
                  detail={`${count(r.totals.conversions)} conversões informadas; não equivalem a vendas`}
                  icon={Users}
                />
              </div>
              <div className="ops-chart-grid">
                <TrendChart
                  title="Investimento por dia"
                  description="Dias sem métricas aparecem como lacunas, sem estimar investimento."
                  availabilityKey="adsSamples"
                  currency
                  rows={r.series}
                  lines={[
                    {
                      key: 'costCents',
                      label: 'Investimento',
                      color: '#246ba5',
                    },
                  ]}
                />
                <TrendChart
                  title="Cliques e conversões informadas"
                  description="As duas séries seguem o relatório importado; lacunas indicam dias sem métricas."
                  availabilityKey="adsSamples"
                  rows={r.series}
                  lines={[
                    { key: 'clicks', label: 'Cliques', color: '#246ba5' },
                    {
                      key: 'conversions',
                      label: 'Conversões',
                      color: '#278676',
                    },
                  ]}
                />
              </div>
              <Card className="ops-data-card">
                <div className="panel-heading">
                  <div>
                    <h3>Campanhas no período</h3>
                    <p>Agregação por conta e ID da campanha; taxas calculadas sobre os totais.</p>
                  </div>
                  <button className="text-button" onClick={() => onNavigate('marketing')}>
                    Gerenciar métricas <ArrowRight size={15} />
                  </button>
                </div>
                <div className="ops-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Campanha / conta</th>
                        <th>Investimento</th>
                        <th>Cliques</th>
                        <th>CTR</th>
                        <th>Conversões</th>
                        <th>CPA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.campaigns.map((c) => (
                        <tr key={`${c.account}:${c.campaignId}`}>
                          <td>
                            <strong>{c.title}</strong>
                            <small>{c.account || 'Conta não informada'}</small>
                          </td>
                          <td>{money(c.costCents)}</td>
                          <td>{count(c.clicks)}</td>
                          <td>
                            {c.impressions ? count((c.clicks / c.impressions) * 100) + '%' : '—'}
                          </td>
                          <td>{count(c.conversions)}</td>
                          <td>{c.conversions ? money(c.costCents / c.conversions) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!r.campaigns.length && (
                    <p className="ops-empty-copy">
                      Importe seu CSV ou adicione métricas em Marketing & Ads.
                    </p>
                  )}
                </div>
              </Card>
            </>
          )}
          {full && selected === 'content' && r.access.blog && (
            <>
              <div className="ops-kpis">
                <Metric
                  label="Publicados"
                  value={count(r.totals.publishedPosts)}
                  detail="Inventário atual, incluindo agendados já liberados"
                  icon={BookOpen}
                />
                <Metric
                  label="Agendados"
                  value={count(r.totals.scheduledPosts)}
                  detail="Conteúdos com publicação futura"
                  icon={BookOpen}
                />
                <Metric
                  label="Atualização do site pendente"
                  value={count(r.totals.syncPending)}
                  detail="Verifique a conexão e a fila do blog"
                  icon={Globe}
                />
              </div>
              <ContentTable report={r} onNavigate={onNavigate} />
            </>
          )}
          {full && selected === 'site' && r.access.site && (
            <>
              <div className="ops-kpis">
                <Metric
                  label="Visualizações de página"
                  value={r.siteConfigured ? count(r.totals.pageViews) : '—'}
                  detail={
                    r.siteConfigured
                      ? 'Eventos page_view recebidos; não são visitantes únicos'
                      : 'Conecte o recebimento de eventos no VPS'
                  }
                  icon={Globe}
                />
                <Metric
                  label="Cliques de contato"
                  value={r.siteConfigured ? count(r.totals.contactClicks) : '—'}
                  detail="Cliques em WhatsApp/telefone; não são mensagens ou vendas"
                  icon={Users}
                />
                <Metric
                  label="Briefings concluídos"
                  value={r.siteConfigured ? count(r.totals.builderSubmissions) : '—'}
                  detail="Eventos de conclusão recebidos do configurador"
                  icon={Layers}
                />
              </div>
              <TrendChart
                title="Site e intenção de contato"
                description="Contagem de eventos recebidos. Ausência de eventos não comprova ausência de visitas."
                rows={r.series}
                lines={[
                  {
                    key: 'pageViews',
                    label: 'Visualizações',
                    color: '#246ba5',
                  },
                  {
                    key: 'contactClicks',
                    label: 'Cliques de contato',
                    color: '#278676',
                  },
                ]}
              />
              <Card className="ops-data-card">
                <div className="panel-heading">
                  <div>
                    <h3>Páginas de entrada e contato</h3>
                    <p>URLs sem parâmetros ou identificadores pessoais.</p>
                  </div>
                  <button className="text-button" onClick={() => onNavigate('site')}>
                    Abrir central do site <ArrowRight size={15} />
                  </button>
                </div>
                <div className="ops-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Página</th>
                        <th>Visualizações</th>
                        <th>Cliques de contato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.pages.map((p) => (
                        <tr key={p.path}>
                          <td>{p.path}</td>
                          <td>{p.views}</td>
                          <td>{p.contacts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!r.pages.length && (
                    <p className="ops-empty-copy">Aguardando eventos da integração.</p>
                  )}
                </div>
              </Card>
            </>
          )}
          {!full && (
            <div className="ops-chart-grid">
              <Card className="ops-queue">
                <div className="panel-heading">
                  <div>
                    <h3>Precisa de atenção</h3>
                    <p>Tarefas, cobranças, prazos e contatos sem atualização.</p>
                  </div>
                  <span className="ops-count">{r.queue.length}</span>
                </div>
                {r.queue.slice(0, 6).map((q) => (
                  <button
                    key={q.id}
                    className="ops-queue-row"
                    onClick={() => {
                      const lead =
                        q.page === 'kanban' ? leads.find((l) => l.id === q.id) : undefined;
                      if (lead && onOpenLead) onOpenLead(lead);
                      else onNavigate(q.page);
                    }}
                  >
                    <i data-urgent={q.urgent} />
                    <span>
                      <strong>{q.title}</strong>
                      <small>
                        {q.detail} · {shortDate(q.date)}
                      </small>
                    </span>
                    <ArrowRight size={16} />
                  </button>
                ))}
                {!r.queue.length && (
                  <p className="ops-empty-copy">
                    Nenhuma pendência encontrada nos registros disponíveis.
                  </p>
                )}
                <button className="text-button" onClick={() => onNavigate('agenda')}>
                  Organizar agenda <ArrowRight size={15} />
                </button>
              </Card>
              <Card className="ops-workspace-map">
                <h3>Da primeira visita à entrega.</h3>
                <p>Uma operação para conectar aquisição, conteúdo e relacionamento.</p>
                <div>
                  {[
                    {
                      page: 'site',
                      label: 'Site & SEO',
                      icon: Globe,
                      allowed: r.access.site,
                    },
                    {
                      page: 'blog',
                      label: 'Blog & conteúdo',
                      icon: BookOpen,
                      allowed: r.access.blog,
                    },
                    {
                      page: 'projects',
                      label: 'Projetos & entregas',
                      icon: Layers,
                      allowed: r.access.project,
                    },
                    {
                      page: 'reports',
                      label: 'Relatórios completos',
                      icon: TrendingUp,
                      allowed: true,
                    },
                  ]
                    .filter((a) => a.allowed)
                    .map(({ page, label, icon: Icon }) => (
                      <button key={page} onClick={() => onNavigate(page as WorkspacePage)}>
                        <Icon size={21} />
                        <strong>{label}</strong>
                        <ArrowRight size={16} />
                      </button>
                    ))}
                </div>
              </Card>
            </div>
          )}
          <details className="ops-methods">
            <summary>Fontes, critérios e atualização</summary>
            <p>
              Atualizado em{' '}
              {new Date(r.generatedAt).toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
              })}
              . Período anterior: {shortDate(r.period.previousFrom)} a{' '}
              {shortDate(r.period.previousTo)}. Cadastros arquivados são excluídos. Indicadores de
              posição atual não são limitados pelo seletor de período.
            </p>
            <p>
              Recebimentos usam as baixas manuais de cobranças. Pipeline soma valores informados nas
              oportunidades e pode misturar projetos e contratos mensais. Campanhas vêm do
              cadastro/CSV/script; não há atribuição automática de receita nem ROAS estimado. O
              calendário editorial mostra o inventário atual. A pontuação editorial verifica
              preenchimento e conteúdo, sem prever ranking ou indexação.
            </p>
            <p>
              Fontes permitidas:{' '}
              {Object.entries(r.access)
                .filter(([, allowed]) => allowed)
                .map(([name]) => name)
                .join(', ')}
              . Registros lidos: {r.coverage.leads} oportunidades, {r.coverage.documents} documentos
              e {r.coverage.events} eventos. Visualizações não medem usuários únicos. Dias sem
              cadastro ou eventos recebidos aparecem como zero nessas contagens. Séries de Ads
              distinguem dias sem métricas de valores zero informados.
            </p>
          </details>
        </>
      )}
    </div>
  );
}
export function ContentTable({
  report: r,
  onNavigate,
}: {
  report: OperationsReport;
  onNavigate: (page: WorkspacePage) => void;
}) {
  return (
    <Card className="ops-data-card">
      <div className="panel-heading">
        <div>
          <h3>Calendário e qualidade editorial</h3>
          <p>
            Datas de publicação/agendamento; rascunhos usam a última atualização. Inventário atual.
          </p>
        </div>
        <Button onClick={() => onNavigate('blog')}>
          Abrir editor <ArrowRight size={16} />
        </Button>
      </div>
      <div className="ops-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Artigo</th>
              <th>Data</th>
              <th>Estado</th>
              <th>Preparação editorial</th>
              <th>Site</th>
            </tr>
          </thead>
          <tbody>
            {r.editorial.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.title}</strong>
                  <small>
                    {p.category} · /blog/{p.slug}
                  </small>
                </td>
                <td>{shortDate(p.date)}</td>
                <td>{statusLabel[p.status] ?? p.status}</td>
                <td>
                  <span className="ops-readiness">
                    {p.score}%<i style={{ width: `${p.score}%` }} />
                  </span>
                </td>
                <td>{statusLabel[p.syncStatus] ?? p.syncStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!r.editorial.length && (
          <p className="ops-empty-copy">Crie o primeiro rascunho para começar o calendário.</p>
        )}
      </div>
    </Card>
  );
}
