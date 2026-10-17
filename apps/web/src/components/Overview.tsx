import { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  ListFilter,
  Zap,
  Target,
  MessageSquare,
  FileSignature,
  TrendingUp,
} from 'lucide-react';
import { AnimatedCounter, Badge, Button, Card, KpiCardSkeleton, Mark } from '@dcfoundry/ui';
import { WorkspaceArt, ConnectedFlow, Sparkline } from './WorkspaceArt.js';
import { ContactAvatar } from './ContactAvatar.js';

interface OverviewLead {
  id: string;
  name: string;
  company: string;
  stage: string;
  monthlyValue: number;
  modality?: string;
  avatarUrl?: string | null;
}
interface OverviewProps<T extends OverviewLead> {
  leads: T[];
  loading: boolean;
  onOpenLead: (lead: T) => void;
  onNavigate: (tab: 'kanban' | 'whatsapp' | 'contracts' | 'marketing' | 'ai_console') => void;
}
const stages: Record<string, { name: string; tone: 'sky' | 'teal' | 'warm' }> = {
  novo: { name: 'Novo lead', tone: 'sky' },
  qualificado_ia: { name: 'Qualificado', tone: 'teal' },
  orcamento: { name: 'Orçamento', tone: 'warm' },
  contrato_ativo: { name: 'Contrato ativo', tone: 'teal' },
};
export function Overview<T extends OverviewLead>({
  leads,
  loading,
  onOpenLead,
  onNavigate,
}: OverviewProps<T>) {
  const [paused, setPaused] = useState(false);
  const recurring = leads
    .filter((lead) => lead.stage === 'contrato_ativo' && lead.modality === 'Retainer Mensal')
    .reduce((sum, lead) => sum + lead.monthlyValue, 0);
  const pipeline = leads
    .filter((lead) => ['qualificado_ia', 'orcamento'].includes(lead.stage))
    .reduce((sum, lead) => sum + lead.monthlyValue, 0);
  const kpis = [
    {
      label: 'Receita recorrente',
      value: recurring,
      currency: true,
      detail: 'Retainers ativos registrados no funil',
      icon: BarChart3,
    },
    {
      label: 'Pipeline qualificado',
      value: pipeline,
      currency: true,
      detail: `${leads.filter((lead) => ['qualificado_ia', 'orcamento'].includes(lead.stage)).length} oportunidades em acompanhamento`,
      icon: ListFilter,
    },
    {
      label: 'Primeira resposta',
      value: null,
      currency: false,
      detail: 'Aguardando atendimento conectado',
      icon: Zap,
    },
    {
      label: 'Retorno em Ads',
      value: null,
      currency: false,
      detail: 'Aguardando seu script do Ads',
      icon: Target,
    },
  ];
  return (
    <div className="overview" data-paused={paused}>
      <section className="workspace-welcome">
        <div>
          <h2>
            Seu negócio, <Mark>em movimento.</Mark>
          </h2>
          <p>Uma visão clara para decidir o próximo passo.</p>
        </div>
        <Button onClick={() => onNavigate('kanban')}>
          Ver meu funil <ArrowRight size={17} />
        </Button>
      </section>
      <div className="overview-kpis" aria-label="Indicadores do workspace">
        {loading
          ? kpis.map((kpi) => <KpiCardSkeleton key={kpi.label} />)
          : kpis.map(({ label, value, currency, detail, icon: Icon }, i) => (
              <Card className="overview-kpi" key={label}>
                <div className="kpi-label">
                  <span className="metric-icon">
                    <Icon size={18} />
                  </span>
                  <span>{label}</span>
                </div>
                <div className="kpi-value">
                  <AnimatedCounter
                    value={value ?? 0}
                    formatter={(v) =>
                      value === null
                        ? '—'
                        : currency
                          ? `R$ ${Math.round(v).toLocaleString('pt-BR')}`
                          : v.toLocaleString('pt-BR')
                    }
                  />
                  {value !== null && value > 0 && <Sparkline index={i} />}
                </div>
                <p>{detail}</p>
              </Card>
            ))}
      </div>
      <div className="overview-focus">
        <Card className="focus-opportunities">
          <div className="panel-heading">
            <div>
              <h3>Oportunidades em foco</h3>
              <p>Leads e negócios para acompanhar de perto.</p>
            </div>
            <button className="text-button" onClick={() => onNavigate('kanban')}>
              Abrir funil <ArrowRight size={15} />
            </button>
          </div>
          <div className="opportunity-list">
            <div className="opportunity-list-head" aria-hidden="true">
              <span>Nome</span>
              <span>Empresa</span>
              <span>Status</span>
              <span />
            </div>
            {leads.length === 0 && (
              <div className="empty-opportunities">
                <strong>Seu primeiro contato pode chegar a qualquer momento.</strong>
                <p>Crie uma oportunidade para começar a organizar o funil.</p>
                <button className="text-button" onClick={() => onNavigate('kanban')}>
                  Abrir funil <ArrowRight size={15} />
                </button>
              </div>
            )}
            {leads.slice(0, 4).map((lead, i) => (
              <button
                className="opportunity-row"
                key={lead.id}
                onClick={() => onOpenLead(lead)}
                aria-label={`Abrir ficha de ${lead.name}`}
              >
                <span className="opportunity-person">
                  <ContactAvatar name={lead.name} photoUrl={lead.avatarUrl} index={i} />
                  <strong>{lead.name}</strong>
                </span>
                <span className="opportunity-company">{lead.company}</span>
                <Badge tone={stages[lead.stage]?.tone ?? 'sky'}>
                  {stages[lead.stage]?.name ?? lead.stage}
                </Badge>
                <ArrowRight className="row-arrow" size={16} />
              </button>
            ))}
          </div>
        </Card>
        <Card className="foundry-invitation">
          <WorkspaceArt paused={paused} />
          <div>
            <h3>
              Um próximo passo.
              <br />
              <Mark>Muitas possibilidades.</Mark>
            </h3>
            <p>Explore o Foundry para entender o contexto e organizar a próxima conversa.</p>
            <button className="text-button" onClick={() => onNavigate('ai_console')}>
              Abrir Foundry IA <ArrowRight size={16} />
            </button>
          </div>
        </Card>
      </div>
      <ConnectedFlow paused={paused} onToggle={() => setPaused((value) => !value)} />
      <Card className="quick-access">
        <div className="panel-heading">
          <div>
            <h3>Acessos rápidos</h3>
            <p>As ações mais comuns do seu dia.</p>
          </div>
        </div>
        <div className="quick-access-grid">
          {[
            {
              tab: 'whatsapp',
              title: 'WhatsApp',
              text: 'Acompanhe conversas e atendimento.',
              icon: MessageSquare,
            },
            {
              tab: 'contracts',
              title: 'Propostas & contratos',
              text: 'Consulte acordos e próximas entregas.',
              icon: FileSignature,
            },
            {
              tab: 'marketing',
              title: 'Marketing & Ads',
              text: 'Veja a origem das oportunidades.',
              icon: TrendingUp,
            },
          ].map(({ tab, title, text, icon: Icon }) => (
            <button
              key={tab}
              onClick={() => onNavigate(tab as 'whatsapp' | 'contracts' | 'marketing')}
            >
              <Icon size={21} />
              <span>
                <strong>{title}</strong>
                <small>{text}</small>
              </span>
              <ArrowRight size={16} />
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
