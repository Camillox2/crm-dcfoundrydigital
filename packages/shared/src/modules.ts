import { z } from 'zod';
import type { ResourceName } from './rbac.js';

const short = z.string().trim().max(180);
const text = z.string().trim().max(12000).default('');
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v,
  );
const optionalDate = z.union([date, z.literal('')]).default('');
const image = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (v) => !v || /^https:\/\//.test(v) || /^\/api\/v1\/media\/[a-f0-9-]+\.(png|jpg|webp)$/.test(v),
    'Use uma imagem HTTPS ou enviada pelo CRM.',
  )
  .default('');
export const ModuleKindSchema = z.enum([
  'blog',
  'contract',
  'invoice',
  'task',
  'template',
  'campaign',
  'knowledge',
  'assistant',
  'conversation',
  'project',
]);
export type ModuleKind = z.infer<typeof ModuleKindSchema>;
export const moduleResources: Record<ModuleKind, ResourceName> = {
  blog: 'blog',
  contract: 'contract',
  invoice: 'finance',
  task: 'task',
  template: 'whatsapp',
  campaign: 'marketing_ads',
  knowledge: 'ai_agent',
  assistant: 'ai_agent',
  conversation: 'ai_agent',
  project: 'task',
};
export const BlogInput = z
  .object({
    title: short.min(3),
    slug: z
      .string()
      .trim()
      .max(180)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    excerpt: z.string().trim().max(500).default(''),
    content: z.string().max(100000).default(''),
    coverUrl: image,
    coverAlt: z.string().trim().max(200).default(''),
    author: short.min(2).default('DC Foundry Digital'),
    category: short.default('Tecnologia'),
    tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
    seoTitle: z.string().trim().max(70).default(''),
    seoDescription: z.string().trim().max(180).default(''),
    status: z.enum(['draft', 'scheduled', 'published']).default('draft'),
    scheduledAt: z.union([z.string().datetime(), z.literal('')]).default(''),
  })
  .superRefine((v, ctx) => {
    if (v.status !== 'draft' && v.content.trim().length < 20)
      ctx.addIssue({
        code: 'custom',
        path: ['content'],
        message: 'Escreva pelo menos 20 caracteres para publicar.',
      });
    if (v.status !== 'draft' && v.coverUrl && !v.coverAlt)
      ctx.addIssue({
        code: 'custom',
        path: ['coverAlt'],
        message: 'Descreva a imagem de capa.',
      });
    if (
      v.status === 'scheduled' &&
      (!v.scheduledAt || Date.parse(v.scheduledAt) < Date.now() + 30000)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['scheduledAt'],
        message: 'Escolha um horário futuro.',
      });
  });
export const ContractInput = z.object({
  title: short.min(3),
  client: short.min(2),
  valueCents: z.number().int().min(0).max(1e11),
  billing: z.enum(['project', 'monthly']),
  status: z
    .enum(['draft', 'sent', 'accepted', 'active', 'completed', 'cancelled'])
    .default('draft'),
  scope: text,
  terms: text,
  validUntil: optionalDate,
});
export const InvoiceInput = z
  .object({
    title: short.min(3),
    client: short.min(2),
    amountCents: z.number().int().positive().max(1e11),
    dueDate: date,
    status: z.enum(['open', 'paid', 'cancelled']).default('open'),
    paidAt: optionalDate,
    method: z.enum(['pix', 'boleto', 'transfer', 'card', 'other']).default('pix'),
    notes: text,
  })
  .superRefine((v, c) => {
    if (v.status === 'paid' && !v.paidAt)
      c.addIssue({
        code: 'custom',
        path: ['paidAt'],
        message: 'Informe a data do recebimento.',
      });
  });
export const TaskInput = z.object({
  title: short.min(3),
  dueDate: optionalDate,
  status: z.enum(['open', 'done']).default('open'),
  priority: z.enum(['normal', 'high']).default('normal'),
  notes: text,
});
export const TemplateInput = z.object({
  title: short.min(3),
  content: z.string().trim().min(2).max(4000),
  category: short.default('Atendimento'),
});
export const ProjectInput = z
  .object({
    title: short.min(3),
    client: short.min(2),
    status: z
      .enum(['planning', 'design', 'development', 'review', 'delivered', 'paused'])
      .default('planning'),
    priority: z.enum(['normal', 'high']).default('normal'),
    startDate: optionalDate,
    dueDate: optionalDate,
    progress: z.number().int().min(0).max(100).default(0),
    budgetCents: z.number().int().min(0).max(1e11).default(0),
    stack: z.string().trim().max(1000).default(''),
    url: z
      .string()
      .trim()
      .max(2048)
      .refine((v) => !v || /^https:\/\//.test(v), 'Use uma URL HTTPS.')
      .default(''),
    scope: text,
    notes: text,
  })
  .superRefine((v, c) => {
    if (v.startDate && v.dueDate && v.dueDate < v.startDate)
      c.addIssue({
        code: 'custom',
        path: ['dueDate'],
        message: 'A entrega deve ser posterior ao início.',
      });
  });
export const CampaignInput = z.object({
  title: short.min(2),
  campaignId: short.min(1),
  account: short.default(''),
  date,
  costCents: z.number().int().min(0).max(1e11),
  impressions: z.number().int().min(0).max(1e10),
  clicks: z.number().int().min(0).max(1e9),
  conversions: z.number().min(0).max(1e8),
  currency: z.literal('BRL').default('BRL'),
});
export const KnowledgeInput = z.object({
  title: short.min(3),
  content: z.string().trim().min(10).max(24000),
  category: short.default('Empresa'),
  audience:z.enum(['public','internal']).default('public'),
});
export const AssistantInput = z.object({
  title: short.min(2).default('Foundry'),
  instructions: z.string().trim().min(10).max(12000),
  tone: z.enum(['direct', 'friendly', 'technical']).default('friendly'),
});
export const ConversationInput = z.object({
  title: short.min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(12000),
      }),
    )
    .max(30),
});
export const moduleSchemas = {
  blog: BlogInput,
  contract: ContractInput,
  invoice: InvoiceInput,
  task: TaskInput,
  template: TemplateInput,
  campaign: CampaignInput,
  knowledge: KnowledgeInput,
  assistant: AssistantInput,
  conversation: ConversationInput,
  project: ProjectInput,
};
export type BlogData = z.infer<typeof BlogInput>;
export type ContractData = z.infer<typeof ContractInput>;
export type InvoiceData = z.infer<typeof InvoiceInput>;
export type TaskData = z.infer<typeof TaskInput>;
export type CampaignData = z.infer<typeof CampaignInput>;
export type ProjectData = z.infer<typeof ProjectInput>;
export type ModuleData = z.infer<(typeof moduleSchemas)[ModuleKind]>;
export interface WorkspaceDocument<T = ModuleData> {
  id: string;
  kind: ModuleKind;
  ownerId: string;
  leadId: string | null;
  data: T;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  syncStatus: string;
}
export interface AuditItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string | null;
  createdAt: string;
  diff: unknown;
}
export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 180);
}
export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
/** Deliberately small safe Markdown subset: raw HTML is always escaped. */
export function markdownHtml(value: string) {
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(
        /\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g,
        '<a href="$2" rel="noopener noreferrer">$1</a>',
      );
  return value
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((block) => {
      if (/^#{1,3} /.test(block)) {
        const level = Math.min(4, (block.match(/^#+/)?.[0].length ?? 1) + 1);
        return `<h${level}>${inline(block.replace(/^#+ /, ''))}</h${level}>`;
      }
      if (block.split('\n').every((line) => /^[-*] /.test(line)))
        return (
          '<ul>' +
          block
            .split('\n')
            .map((line) => `<li>${inline(line.slice(2))}</li>`)
            .join('') +
          '</ul>'
        );
      return '<p>' + inline(block).replace(/\n/g, '<br>') + '</p>';
    })
    .join('\n');
}
