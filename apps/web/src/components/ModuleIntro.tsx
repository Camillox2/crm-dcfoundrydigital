import {
  BookOpen,
  FileSignature,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
  Workflow,
  CalendarDays,
  Layers,
  Globe,
} from 'lucide-react';
import { Mark } from '@dcfoundry/ui';

const modules = {
  settings:{title:'Sua identidade.',accent:'Em um lugar.',text:'Mantenha os dados da contratada para propostas, contratos e contatos.',icon:ShieldCheck},
  reports: {
    title: 'Dados conectados.',
    accent: 'Próximos passos claros.',
    text: 'Compare períodos, acompanhe a operação e consulte os registros de cada área.',
    icon: TrendingUp,
  },
  projects: {
    title: 'Da proposta',
    accent: 'à entrega.',
    text: 'Acompanhe escopo, prazos, orçamento, stack e andamento de cada projeto.',
    icon: Layers,
  },
  agenda: {
    title: 'Cada compromisso.',
    accent: 'No seu tempo.',
    text: 'Organize tarefas, encontre atrasos e acompanhe as próximas entregas no calendário.',
    icon: CalendarDays,
  },
  site: {
    title: 'Site, conteúdo',
    accent: 'e aquisição.',
    text: 'Cuide dos destinos das campanhas, das publicações e das conexões com o CRM.',
    icon: Globe,
  },
  kanban: {
    title: 'Cada oportunidade.',
    accent: 'Um próximo passo.',
    text: 'Da primeira conversa à parceria. Acompanhe o que faz cada negócio avançar.',
    icon: Workflow,
  },
  whatsapp: {
    title: 'Boas conversas.',
    accent: 'Conexões de verdade.',
    text: 'Acompanhe o atendimento e assuma a conversa quando sua presença fizer a diferença.',
    icon: MessageSquare,
  },
  ai_console: {
    title: 'Seu conhecimento.',
    accent: 'Com o Foundry.',
    text: 'Organize o contexto, ajuste as orientações e experimente o assistente.',
    icon: Sparkles,
  },
  contracts: {
    title: 'Tudo combinado.',
    accent: 'Tudo por perto.',
    text: 'Propostas, contratos e alocação da equipe em uma visão clara.',
    icon: FileSignature,
  },
  finance: {
    title: 'Contas em dia.',
    accent: 'Decisões mais claras.',
    text: 'Consulte faturas, recebimentos e os próximos vencimentos.',
    icon: Wallet,
  },
  marketing: {
    title: 'Da campanha',
    accent: 'à oportunidade.',
    text: 'Conecte a origem dos leads aos resultados de cada campanha.',
    icon: TrendingUp,
  },
  blog: {
    title: 'Ideias que merecem',
    accent: 'ser compartilhadas.',
    text: 'Um espaço para acompanhar o conteúdo e planejar as próximas publicações.',
    icon: BookOpen,
  },
  audit: {
    title: 'Cada atividade.',
    accent: 'Com mais clareza.',
    text: 'Acompanhe o histórico de ações, acessos e alterações no workspace.',
    icon: ShieldCheck,
  },
};

export function ModuleIntro({ page }: { page: string }) {
  const module = modules[page as keyof typeof modules];
  if (!module) return null;
  const Icon = module.icon;
  return (
    <section className="module-intro">
      <div>
        <h2>
          {module.title} <Mark>{module.accent}</Mark>
        </h2>
        <p>{module.text}</p>
      </div>
      <div className="module-vector" aria-hidden="true">
        <svg viewBox="0 0 190 80" fill="none">
          <path d="M5 53C28 25 63 67 84 41S144 6 182 29" />
          <circle cx="11" cy="48" r="4" />
          <circle cx="177" cy="27" r="4" />
        </svg>
        <span>
          <Icon size={26} strokeWidth={1.4} />
        </span>
      </div>
    </section>
  );
}
