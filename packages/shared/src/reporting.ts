import type { WorkspacePage } from './workspace.js';

export type ReportDocument = {
  id: string;
  kind: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
  syncStatus?: string;
};
export type ReportLead = {
  id: string;
  name: string;
  company: string;
  stage: string;
  monthlyValue: number;
  campaign: string;
  gclid?: string;
  createdAt: string;
  updatedAt: string;
  highPriority?: boolean;
};
export type SiteEvent = {
  event: string;
  path: string;
  source: string;
  medium: string;
  campaign: string;
  occurredAt: string;
};
export const reportSources = [
  'lead',
  'task',
  'project',
  'invoice',
  'contract',
  'blog',
  'campaign',
  'site',
] as const;
export type ReportSource = (typeof reportSources)[number];
export type ReportAccess = Record<ReportSource, boolean>;
export const businessDate = (value: string | Date = new Date()) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date(value));
const shift = (date: string, days: number) =>
  new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const s = (v: unknown) => String(v ?? '');
const sum = (rows: ReportDocument[], field: string) =>
  rows.reduce((total, row) => total + n(row.data[field]), 0);
export function contentReadiness(data: Record<string, unknown>) {
  const checks = [
    {
      label: 'Título claro (15–70 caracteres)',
      ok:
        s(data.seoTitle || data.title).length >= 15 && s(data.seoTitle || data.title).length <= 70,
    },
    {
      label: 'Descrição para busca (70–180 caracteres)',
      ok:
        s(data.seoDescription || data.excerpt).length >= 70 &&
        s(data.seoDescription || data.excerpt).length <= 180,
    },
    {
      label: 'URL legível',
      ok: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s(data.slug)),
    },
    {
      label: 'Conteúdo com pelo menos 300 caracteres',
      ok: n(data.contentLength ?? s(data.content).length) >= 300,
    },
    {
      label: 'Capa com descrição alternativa',
      ok: Boolean(data.coverUrl && data.coverAlt),
    },
  ];
  return {
    checks,
    score: Math.round((checks.filter((c) => c.ok).length / checks.length) * 100),
  };
}

/** Active, authorized records only. Stocks are explicitly separate from period flows. */
export function buildOperationsReport(input: {
  leads: ReportLead[];
  documents: ReportDocument[];
  events: SiteEvent[];
  access: ReportAccess;
  days: number;
  now?: Date;
  truncated?: boolean;
  siteConfigured?: boolean;
}) {
  const now = input.now ?? new Date(),
    today = businessDate(now);
  const days = [7, 30, 90].includes(input.days) ? input.days : 30;
  const from = shift(today, -(days - 1)),
    previousFrom = shift(from, -days),
    previousTo = shift(from, -1);
  const within = (date: string, start = from, end = today) =>
    Boolean(date && date >= start && date <= end);
  const dateOf = (v: string) => (v ? businessDate(v) : '');
  const byKind = (kind: string) => input.documents.filter((d) => d.kind === kind);
  const invoices = byKind('invoice'),
    tasks = byKind('task'),
    projects = byKind('project'),
    posts = byKind('blog');
  const periodLeads = input.leads.filter((l) => within(dateOf(l.createdAt)));
  const previousLeads = input.leads.filter((l) =>
    within(dateOf(l.createdAt), previousFrom, previousTo),
  );
  const paid = invoices.filter((d) => d.data.status === 'paid' && within(s(d.data.paidAt)));
  const previousPaid = invoices.filter(
    (d) => d.data.status === 'paid' && within(s(d.data.paidAt), previousFrom, previousTo),
  );
  const open = invoices.filter((d) => d.data.status === 'open');
  const overdue = open.filter((d) => s(d.data.dueDate) && s(d.data.dueDate) < today);
  const campaigns = byKind('campaign').filter((d) => within(s(d.data.date)));
  const costCents = sum(campaigns, 'costCents'),
    clicks = sum(campaigns, 'clicks'),
    impressions = sum(campaigns, 'impressions'),
    conversions = sum(campaigns, 'conversions');
  const dueTasks = tasks.filter((d) => d.data.status === 'open');
  const effectivePublication = (d: ReportDocument) =>
    d.data.status === 'published' ||
    (d.data.status === 'scheduled' && Date.parse(s(d.data.scheduledAt)) <= now.getTime());
  const editorial = posts
    .map((d) => ({
      id: d.id,
      title: s(d.data.title),
      slug: s(d.data.slug),
      category: s(d.data.category) || 'Sem categoria',
      status: effectivePublication(d) ? 'published' : s(d.data.status),
      date:
        d.data.status === 'scheduled'
          ? dateOf(s(d.data.scheduledAt))
          : dateOf(d.publishedAt || d.updatedAt),
      syncStatus: d.syncStatus ?? 'not_configured',
      score: contentReadiness(d.data).score,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const events = input.events.filter((e) => within(dateOf(e.occurredAt)));
  const isContact = (event: string) => /whatsapp|phone_click|contact_click/.test(event);
  const totals = {
    leads: input.leads.length,
    newLeads: periodLeads.length,
    previousLeads: previousLeads.length,
    pipelineCents: Math.round(
      input.leads
        .filter((l) => ['qualificado_ia', 'orcamento'].includes(l.stage))
        .reduce((v, l) => v + l.monthlyValue * 100, 0),
    ),
    activeClients: input.leads.filter((l) => l.stage === 'contrato_ativo').length,
    receivedCents: sum(paid, 'amountCents'),
    previousReceivedCents: sum(previousPaid, 'amountCents'),
    openCents: sum(open, 'amountCents'),
    overdueCents: sum(overdue, 'amountCents'),
    overdueInvoices: overdue.length,
    openTasks: dueTasks.length,
    overdueTasks: dueTasks.filter((d) => s(d.data.dueDate) && s(d.data.dueDate) < today).length,
    activeProjects: projects.filter((d) => !['delivered', 'paused'].includes(s(d.data.status)))
      .length,
    deliveredProjects: projects.filter((d) => d.data.status === 'delivered').length,
    posts: posts.length,
    publishedPosts: editorial.filter((p) => p.status === 'published').length,
    scheduledPosts: editorial.filter((p) => p.status === 'scheduled').length,
    syncPending: editorial.filter(
      (p) => ['pending', 'retry', 'not_configured'].includes(p.syncStatus) && p.status !== 'draft',
    ).length,
    costCents,
    clicks,
    impressions,
    conversions,
    ctr: impressions ? (clicks / impressions) * 100 : null,
    cpcCents: clicks ? costCents / clicks : null,
    cpaCents: conversions ? costCents / conversions : null,
    pageViews: events.filter((e) => e.event === 'page_view').length,
    contactClicks: events.filter((e) => isContact(e.event)).length,
    builderSubmissions: events.filter((e) =>
      /project_builder_submit|project_studio_complete/.test(e.event),
    ).length,
  };
  const series = Array.from({ length: days }, (_, i) => {
    const date = shift(from, i);
    const ads = campaigns.filter((d) => d.data.date === date);
    return {
      date,
      leads: periodLeads.filter((l) => dateOf(l.createdAt) === date).length,
      receivedCents: sum(
        paid.filter((d) => d.data.paidAt === date),
        'amountCents',
      ),
      dueCents: sum(
        invoices.filter((d) => d.data.status !== 'cancelled' && d.data.dueDate === date),
        'amountCents',
      ),
      adsSamples: ads.length,
      costCents: sum(ads, 'costCents'),
      clicks: sum(ads, 'clicks'),
      conversions: sum(ads, 'conversions'),
      pageViews: events.filter((e) => e.event === 'page_view' && dateOf(e.occurredAt) === date)
        .length,
      contactClicks: events.filter((e) => isContact(e.event) && dateOf(e.occurredAt) === date)
        .length,
    };
  });
  const funnel = ['novo', 'qualificado_ia', 'orcamento', 'contrato_ativo'].map((stage) => ({
    stage,
    count: input.leads.filter((l) => l.stage === stage).length,
  }));
  const origins = [
    ...new Set(
      input.leads.map(
        (l) => l.campaign || (l.gclid ? 'Google Ads (sem campanha)' : 'Origem não informada'),
      ),
    ),
  ]
    .map((label) => ({
      label,
      count: input.leads.filter(
        (l) =>
          (l.campaign || (l.gclid ? 'Google Ads (sem campanha)' : 'Origem não informada')) ===
          label,
      ).length,
    }))
    .sort((a, b) => b.count - a.count);
  const adGroups = new Map<
    string,
    {
      title: string;
      account: string;
      campaignId: string;
      costCents: number;
      impressions: number;
      clicks: number;
      conversions: number;
    }
  >();
  for (const row of campaigns) {
    const d = row.data,
      key = JSON.stringify([d.account, d.campaignId]);
    const group = adGroups.get(key) ?? {
      title: s(d.title),
      account: s(d.account),
      campaignId: s(d.campaignId),
      costCents: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    };
    for (const field of ['costCents', 'impressions', 'clicks', 'conversions'] as const)
      group[field] += n(d[field]);
    adGroups.set(key, group);
  }
  const pages = [...new Set(events.map((e) => e.path))]
    .map((path) => ({
      path,
      views: events.filter((e) => e.path === path && e.event === 'page_view').length,
      contacts: events.filter((e) => e.path === path && isContact(e.event)).length,
    }))
    .sort((a, b) => b.views - a.views);
  const queue: {
    id: string;
    title: string;
    detail: string;
    date: string;
    page: WorkspacePage;
    urgent: boolean;
  }[] = [
    ...dueTasks.map((d) => ({
      id: d.id,
      title: s(d.data.title),
      detail: 'Tarefa em aberto',
      date: s(d.data.dueDate),
      page: 'agenda' as const,
      urgent: Boolean(d.data.dueDate && s(d.data.dueDate) < today) || d.data.priority === 'high',
    })),
    ...overdue.map((d) => ({
      id: d.id,
      title: s(d.data.title),
      detail: `Cobrança vencida · ${s(d.data.client)}`,
      date: s(d.data.dueDate),
      page: 'finance' as const,
      urgent: true,
    })),
    ...projects
      .filter(
        (d) =>
          !['delivered', 'paused'].includes(s(d.data.status)) &&
          d.data.dueDate &&
          s(d.data.dueDate) < today,
      )
      .map((d) => ({
        id: d.id,
        title: s(d.data.title),
        detail: 'Projeto com entrega atrasada',
        date: s(d.data.dueDate),
        page: 'projects' as const,
        urgent: true,
      })),
    ...input.leads
      .filter((l) => l.stage !== 'contrato_ativo' && dateOf(l.updatedAt) < shift(today, -7))
      .map((l) => ({
        id: l.id,
        title: l.company,
        detail: 'Oportunidade sem atualização há mais de 7 dias',
        date: dateOf(l.updatedAt),
        page: 'kanban' as const,
        urgent: Boolean(l.highPriority),
      })),
  ].sort(
    (a, b) =>
      Number(b.urgent) - Number(a.urgent) || (a.date || '9999').localeCompare(b.date || '9999'),
  );
  return {
    generatedAt: now.toISOString(),
    period: { days, from, to: today, previousFrom, previousTo },
    access: input.access,
    truncated: Boolean(input.truncated),
    siteConfigured: Boolean(input.siteConfigured),
    totals,
    series,
    funnel,
    origins,
    campaigns: [...adGroups.values()].sort((a, b) => b.costCents - a.costCents),
    editorial,
    pages,
    queue,
    projects: projects.map((d) => ({ id: d.id, ...d.data })),
    coverage: {
      leads: input.leads.length,
      documents: input.documents.length,
      events: events.length,
    },
  };
}
export type OperationsReport = ReturnType<typeof buildOperationsReport>;
export function reportCsvRows(r: OperationsReport, view: string): Record<string, unknown>[] {
  const meta = {
    inicio: r.period.from,
    fim: r.period.to,
    atualizadoEm: r.generatedAt,
    parcial: r.truncated,
  };
  if (view === 'marketing')
    return r.campaigns.map((c) => ({
      ...meta,
      ...c,
      ctrPercent: c.impressions ? (c.clicks / c.impressions) * 100 : null,
      cpcCents: c.clicks ? c.costCents / c.clicks : null,
      cpaCents: c.conversions ? c.costCents / c.conversions : null,
    }));
  if (view === 'content')
    return r.editorial.map((p) => ({ inventarioEm: r.generatedAt, parcial: r.truncated, ...p }));
  if (view === 'site') return r.pages.map((p) => ({ ...meta, ...p }));
  return r.series.map((row) => ({
    ...meta,
    date: row.date,
    ...((view === 'daily' || view === 'commercial') && r.access.lead ? { leads: row.leads } : {}),
    ...((view === 'daily' || view === 'finance') && r.access.invoice
      ? { receivedCents: row.receivedCents, dueCents: row.dueCents }
      : {}),
    ...(view === 'daily' && r.access.campaign
      ? {
          adsReported: row.adsSamples > 0,
          costCents: row.adsSamples ? row.costCents : null,
          clicks: row.adsSamples ? row.clicks : null,
          conversions: row.adsSamples ? row.conversions : null,
        }
      : {}),
    ...(view === 'daily' && r.access.site
      ? {
          pageViews: r.siteConfigured ? row.pageViews : null,
          contactClicks: r.siteConfigured ? row.contactClicks : null,
        }
      : {}),
  }));
}
