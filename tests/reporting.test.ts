import { describe, it, expect } from 'vitest';
import {
  buildOperationsReport,
  contentReadiness,
  ProjectInput,
  reportCsvRows,
  type ReportDocument,
  type ReportLead,
} from '@dcfoundry/shared';
const now = new Date('2026-10-17T12:00:00Z');
const access = {
  lead: true,
  task: true,
  project: true,
  invoice: true,
  contract: true,
  blog: true,
  campaign: true,
  site: true,
};
const doc = (kind: string, data: Record<string, unknown>, id = kind): ReportDocument => ({
  id,
  kind,
  data,
  createdAt: '2026-10-16T12:00:00Z',
  updatedAt: '2026-10-16T12:00:00Z',
});
const lead = (date: string, stage = 'novo'): ReportLead => ({
  id: date,
  name: 'Teste',
  company: 'Teste',
  createdAt: date,
  updatedAt: date,
  stage,
  monthlyValue: 100,
  campaign: '',
});
describe('Operational measurements', () => {
  it('separates current stocks, prior period and actual paid-date cash flows', () => {
    const r = buildOperationsReport({
      now,
      days: 7,
      access,
      events: [],
      leads: [
        lead('2026-10-11T12:00:00Z', 'orcamento'),
        lead('2026-10-10T12:00:00Z'),
        lead('2026-10-17T02:59:00Z'),
      ],
      documents: [
        doc(
          'invoice',
          {
            status: 'paid',
            paidAt: '2026-10-12',
            dueDate: '2026-10-01',
            amountCents: 10000,
          },
          'paid',
        ),
        doc(
          'invoice',
          {
            status: 'paid',
            paidAt: '2026-10-10',
            dueDate: '2026-10-10',
            amountCents: 2000,
          },
          'previous',
        ),
        doc('invoice', { status: 'open', dueDate: '2026-10-01', amountCents: 3000 }, 'open'),
        doc(
          'invoice',
          { status: 'cancelled', dueDate: '2026-10-12', amountCents: 999999 },
          'cancelled',
        ),
        doc('task', { status: 'open', dueDate: '', title: 'Sem prazo' }, 'undated'),
        doc('task', { status: 'open', dueDate: '2026-10-12', title: 'Atrasada' }, 'overdue'),
      ],
    });
    expect(r.period).toMatchObject({
      from: '2026-10-11',
      to: '2026-10-17',
      previousFrom: '2026-10-04',
      previousTo: '2026-10-10',
    });
    expect(r.totals).toMatchObject({
      newLeads: 2,
      previousLeads: 1,
      pipelineCents: 10000,
      receivedCents: 10000,
      previousReceivedCents: 2000,
      openCents: 3000,
      overdueCents: 3000,
      openTasks: 2,
      overdueTasks: 1,
    });
    expect(r.series.reduce((v, d) => v + d.receivedCents, 0)).toBe(r.totals.receivedCents);
    expect(r.queue.find((q) => q.id === 'undated')?.urgent).toBe(false);
  });
  it('calculates weighted campaign rates and distinguishes identical IDs in different accounts', () => {
    const r = buildOperationsReport({
      now,
      days: 7,
      access,
      leads: [],
      events: [],
      documents: [
        doc(
          'campaign',
          {
            date: '2026-10-12',
            title: 'A',
            account: 'one',
            campaignId: '1',
            costCents: 1000,
            clicks: 10,
            impressions: 100,
            conversions: 2,
          },
          'a',
        ),
        doc(
          'campaign',
          {
            date: '2026-10-13',
            title: 'A',
            account: 'one',
            campaignId: '1',
            costCents: 3000,
            clicks: 30,
            impressions: 900,
            conversions: 3,
          },
          'b',
        ),
        doc(
          'campaign',
          {
            date: '2026-10-13',
            title: 'B',
            account: 'two',
            campaignId: '1',
            costCents: 1000,
            clicks: 10,
            impressions: 0,
            conversions: 0,
          },
          'c',
        ),
      ],
    });
    expect(r.totals.ctr).toBe(5);
    expect(r.totals.cpcCents).toBe(100);
    expect(r.totals.cpaCents).toBe(1000);
    expect(r.campaigns).toHaveLength(2);
    expect(r.campaigns[0]?.costCents).toBe(4000);
    expect(reportCsvRows(r, 'marketing')).toHaveLength(2);
    expect(reportCsvRows(r, 'marketing')[0]).toMatchObject({
      costCents: 4000,
      clicks: 40,
      ctrPercent: 4,
      cpcCents: 100,
    });
    expect(r.series.reduce((v, d) => v + d.costCents, 0)).toBe(5000);
  });
  it('uses null for undefined rates and does not fabricate visits, income or conversion history', () => {
    const r = buildOperationsReport({
      now,
      days: 7,
      access,
      leads: [],
      documents: [],
      events: [],
    });
    expect(r.totals).toMatchObject({
      ctr: null,
      cpcCents: null,
      cpaCents: null,
      pageViews: 0,
      receivedCents: 0,
    });
    expect(r.siteConfigured).toBe(false);
    expect(r.queue).toHaveLength(0);
    expect(r.series).toHaveLength(7);
  });
  it('releases due scheduled articles and classifies contact clicks separately from page views', () => {
    const r = buildOperationsReport({
      now,
      days: 7,
      access,
      leads: [],
      documents: [
        doc(
          'blog',
          {
            title: 'Artigo completo para revisão',
            slug: 'artigo',
            status: 'scheduled',
            scheduledAt: '2026-10-17T09:00:00Z',
            contentLength: 400,
            seoDescription: 'a'.repeat(80),
            coverUrl: 'https://example.com/a.jpg',
            coverAlt: 'Descrição',
          },
          'post',
        ),
      ],
      events: [
        {
          event: 'page_view',
          path: '/blog/artigo',
          source: 'google',
          medium: 'organic',
          campaign: '',
          occurredAt: '2026-10-17T09:00:00Z',
        },
        {
          event: 'footer_whatsapp_click',
          path: '/blog/artigo',
          source: '',
          medium: '',
          campaign: '',
          occurredAt: '2026-10-17T09:01:00Z',
        },
      ],
    });
    expect(r.totals).toMatchObject({
      publishedPosts: 1,
      scheduledPosts: 0,
      pageViews: 1,
      contactClicks: 1,
    });
    expect(r.editorial[0]?.score).toBe(100);
    expect(r.pages[0]).toMatchObject({ views: 1, contacts: 1 });
    expect(contentReadiness({ title: 'X', slug: 'invalid ?' }).score).toBe(0);
  });
  it('validates project progress and coherent delivery dates', () => {
    const base = {
      title: 'Projeto de teste',
      client: 'Empresa de teste',
      startDate: '2026-10-17',
      dueDate: '2026-10-16',
    };
    expect(ProjectInput.safeParse(base).success).toBe(false);
    expect(ProjectInput.safeParse({ ...base, dueDate: '2026-10-20', progress: 101 }).success).toBe(
      false,
    );
    expect(
      ProjectInput.safeParse({
        ...base,
        dueDate: '2026-10-20',
        progress: 50,
        url: 'javascript:alert(1)',
      }).success,
    ).toBe(false);
  });
  it('exports only the selected grain, preserves missing Ads days and omits forbidden metrics', () => {
    const r = buildOperationsReport({
      now,
      days: 7,
      access: { ...access, invoice: false },
      leads: [],
      documents: [],
      events: [],
    });
    const daily = reportCsvRows(r, 'daily');
    expect(daily).toHaveLength(7);
    expect(daily[0]).not.toHaveProperty('receivedCents');
    expect(daily[0]).toMatchObject({
      adsReported: false,
      costCents: null,
      clicks: null,
      pageViews: null,
    });
    expect(reportCsvRows(r, 'content')).toHaveLength(0);
    expect(reportCsvRows(r, 'site')).toHaveLength(0);
  });
});
