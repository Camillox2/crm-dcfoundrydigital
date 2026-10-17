import { z } from 'zod';
import { isWonLead, isLostLead } from './pipeline.js';

export const LeadStageSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/);
export const CreateWorkspaceLeadSchema = z.object({
  name: z.string().trim().min(2).max(180),
  company: z.string().trim().min(2).max(180),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s()-]{10,24}$/)
    .refine((value) => value.replace(/\D/g, '').length >= 10, 'A valid phone number is required'),
  scopeSummary: z.string().trim().max(2000).default(''),
  modality: z.enum(['Retainer Mensal', 'Projeto Fechado']).default('Projeto Fechado'),
  monthlyValue: z.number().finite().min(0).max(100_000_000).default(0),
  notes: z.string().trim().max(4000).default(''),
  highPriority: z.boolean().default(false),
  campaign: z.string().trim().max(150).optional(),
  gclid: z.string().trim().max(200).optional(),
});
export type WorkspaceLeadInput = z.infer<typeof CreateWorkspaceLeadSchema>;
export interface WorkspaceLead extends WorkspaceLeadInput {
  id: string;
  stage: z.infer<typeof LeadStageSchema>;
  stageName?: string;
  stageIsWon?: boolean;
  stageIsLost?: boolean;
  tags?: { id: string; name: string; color: string }[];
  score: number;
  temperature: 'Quente' | 'Morno' | 'Frio';
  campaign: string;
  gclid: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
export type WorkspacePage =
  | 'dashboard'
  | 'kanban'
  | 'contracts'
  | 'finance'
  | 'whatsapp'
  | 'site_chat'
  | 'ai_console'
  | 'marketing'
  | 'blog'
  | 'audit'
  | 'reports'
  | 'projects'
  | 'agenda'
  | 'site'
  | 'settings'
  | 'portal';
// Company legal identity is available through the existing settings permission.
// Each surface still uses the existing role and owner/team boundaries.
export interface DailyInsight {
  id: string;
  title: string;
  detail: string;
  action: string;
  page: WorkspacePage;
  leadId?: string;
  tone: 'priority' | 'info';
}
export function getDailyInsights(leads: readonly WorkspaceLead[]): DailyInsight[] {
  const insights: DailyInsight[] = [];
  const priority = leads
    .filter((lead) => lead.highPriority && !isWonLead(lead) && !isLostLead(lead))
    .sort((a, b) => b.monthlyValue - a.monthlyValue)[0];
  if (priority)
    insights.push({
      id: `priority-${priority.id}`,
      title: `${priority.company} está na sua lista de prioridades.`,
      detail: 'Oportunidade marcada como prioritária no seu funil.',
      action: 'Abrir contato',
      page: 'kanban',
      leadId: priority.id,
      tone: 'priority',
    });
  const proposals = leads.filter((lead) => lead.stage === 'orcamento');
  if (proposals.length)
    insights.push({
      id: 'proposals',
      title: `${proposals.length} ${proposals.length === 1 ? 'proposta para acompanhar' : 'propostas para acompanhar'}.`,
      detail: 'Estas oportunidades estão na etapa de proposta. Confira o próximo contato.',
      action: 'Ver propostas no funil',
      page: 'kanban',
      tone: 'info',
    });
  const newLeads = leads.filter((lead) => lead.stage === 'novo');
  if (newLeads.length)
    insights.push({
      id: 'new-leads',
      title: `${newLeads.length} ${newLeads.length === 1 ? 'nova oportunidade' : 'novas oportunidades'} no funil.`,
      detail: 'Conheça o contexto antes de avançar a conversa.',
      action: 'Abrir funil',
      page: 'kanban',
      tone: 'info',
    });
  if (!leads.length)
    insights.push({
      id: 'first-contact',
      title: 'Um workspace limpo. Pronto para começar.',
      detail:
        'Cadastre seu primeiro contato para acompanhar as oportunidades e receber prioridades aqui.',
      action: 'Começar pelo funil',
      page: 'kanban',
      tone: 'info',
    });
  insights.push({
    id: 'ads-setup',
    title: 'Seu Google Ads pode entrar nesta visão.',
    detail: 'A integração aguarda o script que você vai configurar. Os resultados aparecerão aqui.',
    action: 'Ver Marketing & Ads',
    page: 'marketing',
    tone: 'info',
  });
  return insights;
}
