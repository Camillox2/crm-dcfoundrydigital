import {
  BookOpen,
  CheckCircle2,
  FileSignature,
  Inbox,
  Link2,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { Button, Card } from '@dcfoundry/ui';
import type { WorkspacePage } from '@dcfoundry/shared';

const modules = {
  contracts: {
    icon: FileSignature,
    title: 'Seu primeiro contrato começa com uma conversa.',
    text: 'Acompanhe as oportunidades no funil. As propostas e assinaturas devem ser conectadas à API.',
    action: 'Abrir funil',
  },
  finance: {
    icon: Wallet,
    title: 'Contas limpas para um novo começo.',
    text: 'Ainda não há faturas ou recebimentos cadastrados. Os recebimentos aparecem conforme as integrações forem configuradas.',
    action: 'Abrir funil',
  },
  whatsapp: {
    icon: Inbox,
    title: 'As próximas conversas chegam por aqui.',
    text: 'Conecte uma sessão Baileys no seu servidor para receber contatos e fotos de perfil. Sem foto disponível, usamos as iniciais.',
    action: 'Ver preparação da conexão',
  },
  ai_console: {
    icon: Sparkles,
    title: 'O Foundry já ajuda a organizar seu dia.',
    text: 'Abra o personagem flutuante para ver prioridades do workspace. Conversas com um modelo de IA dependem da configuração do provedor no servidor.',
    action: 'Ver prioridades do dia',
  },
  marketing: {
    icon: Link2,
    title: 'Pronto para o seu script do Google Ads.',
    text: 'Configure o script depois no seu VPS. Investimento, campanhas e retorno aparecem depois da integração.',
    action: 'Ver checklist da integração',
  },
  blog: {
    icon: BookOpen,
    title: 'Espaço para as próximas ideias.',
    text: 'Seu workspace começa sem artigos cadastrados. A integração do editor e da API do blog deve ser configurada no servidor.',
    action: 'Conhecer o blog do site',
  },
  audit: {
    icon: ShieldCheck,
    title: 'Um histórico para acompanhar a operação.',
    text: 'Os registros aparecem conforme as ações reais são realizadas pela API. A consulta segue as permissões do seu perfil.',
    action: 'Ver preparação do workspace',
  },
} as const;

export function EmptyModule({
  page,
  onNavigate,
  onOpenFoundry,
}: {
  page: WorkspacePage;
  onNavigate: (page: WorkspacePage) => void;
  onOpenFoundry: () => void;
}) {
  const item = modules[page as keyof typeof modules];
  if (!item) return null;
  const Icon = item.icon;
  return (
    <Card className="empty-module">
      <div className="empty-module-art" aria-hidden="true">
        <span />
        <Icon size={48} strokeWidth={1.1} />
        <i />
      </div>
      <h3>{item.title}</h3>
      <p>{item.text}</p>
      {page === 'whatsapp' || page === 'marketing' || page === 'audit' ? (
        <div className="integration-checklist">
          {(page === 'marketing'
            ? [
                'Adicionar o script depois',
                'Configurar autenticação do recebimento',
                'Validar conta, moeda e período dos dados',
              ]
            : page === 'whatsapp'
              ? [
                  'Configurar o worker Baileys no VPS',
                  'Parear a sessão WhatsApp',
                  'Respeitar a disponibilidade da foto de cada contato',
                ]
              : [
                  'Configurar banco e administrador',
                  'Registrar operações reais na API',
                  'Consultar o histórico com o perfil autorizado',
                ]
          ).map((text) => (
            <span key={text}>
              <CheckCircle2 size={16} />
              {text}
            </span>
          ))}
        </div>
      ) : page === 'blog' ? (
        <a
          className="text-button"
          href="https://dcfoundrydigital.com/blog"
          target="_blank"
          rel="noreferrer"
        >
          {item.action}
        </a>
      ) : (
        <Button onClick={() => (page === 'ai_console' ? onOpenFoundry() : onNavigate('kanban'))}>
          {item.action}
        </Button>
      )}
    </Card>
  );
}
