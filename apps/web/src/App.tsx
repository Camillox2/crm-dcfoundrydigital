import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  KanbanSquare,
  MessageSquare,
  Cpu,
  Layers,
  CreditCard,
  TrendingUp,
  ShieldCheck,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  FileSignature,
  Sun,
  Moon,
  LogOut,
  Plus,
  QrCode,
  ArrowRight,
  Clock,
  Database,
  Send,
  Filter,
  Eye,
  X,
  Copy,
  Check,
  AlertTriangle,
  BookOpen,
} from 'lucide-react';
import {
  AnimatedCounter,
  Badge,
  FoundryArchitectureArt,
  Button,
  Card,
  ContractSignedArt,
  DcLogo,
  DeliveryArt,
  KpiCardSkeleton,
  Mark,
  ResponsiveTable,
  TableListSkeleton,
  useTheme,
} from '@dcfoundry/ui';
import { ROLES, type RoleName } from '@dcfoundry/shared';
import {
  processInboundWhatsAppWithAi,
  computeDeterministicEmbedding768,
  type RagChunkRecord,
} from '@dcfoundry/ai';
import {
  calculateCampaignRoiMetrics,
  calculateAttributionShares,
  decorateWhatsAppLinkWithTrackingCode,
  type AttributionModel,
} from '@dcfoundry/tracking';
import { PermissionGate } from './components/PermissionGate.js';
import { LoginPage, type AuthenticatedSession } from './pages/LoginPage.js';
import '@dcfoundry/ui/tokens.css';

type NavTabId =
  | 'dashboard'
  | 'kanban'
  | 'whatsapp'
  | 'ai_console'
  | 'contracts'
  | 'finance'
  | 'marketing'
  | 'blog'
  | 'audit';

interface KanbanLeadCard {
  id: string;
  name: string;
  company: string;
  phone: string;
  scopeSummary: string;
  modality: 'Retainer Mensal' | 'Projeto Fechado';
  stage: 'novo' | 'qualificado_ia' | 'orcamento' | 'contrato_ativo';
  score: number;
  temperature: 'Quente' | 'Morno' | 'Frio';
  highPriority: boolean;
  campaign: string;
  gclid: string;
  monthlyValue: number;
  notes: string;
}

const INITIAL_LEADS: KanbanLeadCard[] = [
  {
    id: 'LD-201',
    name: 'Ricardo Vasconcelos',
    company: 'Vortex Fintech S.A.',
    phone: '+55 11 99812-3401',
    scopeSummary: 'Squad Dedicada Full-Stack + Agente IA WhatsApp RAG',
    modality: 'Retainer Mensal',
    stage: 'qualificado_ia',
    score: 96,
    temperature: 'Quente',
    highPriority: true,
    campaign: 'Search - Engenharia de Software & IA',
    gclid: 'CjwKCA_DCF_SaaS_01',
    monthlyValue: 15400,
    notes: 'Precisa substituir legado monolítico e integrar atendimento IA com ERP em 30 dias.',
  },
  {
    id: 'LD-202',
    name: 'Mariana Costa',
    company: 'MedPrime Diagnósticos',
    phone: '+55 11 98741-9022',
    scopeSummary: 'Agente Autônomo WhatsApp + Atribuição Google Ads Offline',
    modality: 'Retainer Mensal',
    stage: 'orcamento',
    score: 89,
    temperature: 'Quente',
    highPriority: true,
    campaign: 'Search - Automacao WhatsApp IA',
    gclid: 'CjwKCA_DCF_WA_AI_02',
    monthlyValue: 4800,
    notes: 'Recebe 400 leads/dia via Google Ads e quer medir ROAS real no fechamento.',
  },
  {
    id: 'LD-203',
    name: 'Henrique Bastos',
    company: 'Atlas Logística Global',
    phone: '+55 11 97110-5500',
    scopeSummary: 'Plataforma Web PWA + Painel Operacional em Tempo Real',
    modality: 'Projeto Fechado',
    stage: 'novo',
    score: 78,
    temperature: 'Morno',
    highPriority: false,
    campaign: 'Search - Desenvolvimento Web Enterprise',
    gclid: 'CjwKCA_DCF_Web_03',
    monthlyValue: 28000,
    notes: 'Solicitou escopo fechado com entrega em 6 semanas e suporte continuado.',
  },
  {
    id: 'LD-204',
    name: 'Fernanda Nogueira',
    company: 'Krono Capital',
    phone: '+55 11 99200-1188',
    scopeSummary: 'Retainer Engenharia Full-Stack + Cloud High-Availability',
    modality: 'Retainer Mensal',
    stage: 'contrato_ativo',
    score: 98,
    temperature: 'Quente',
    highPriority: false,
    campaign: 'Search - Engenharia de Software & IA',
    gclid: 'CjwKCA_DCF_Retainer_04',
    monthlyValue: 12500,
    notes: 'Contrato assinado digitalmente; squad alocada sem sobreposição.',
  },
];

const INITIAL_KB_CHUNKS: RagChunkRecord[] = [
  {
    id: 'kb_chunk_01',
    documentId: 'doc_catalogo_dcf',
    documentTitle: 'Catálogo de Soluções DC Foundry Digital 2026.pdf',
    category: 'catalog',
    chunkIndex: 0,
    contentText:
      'A DC Foundry Digital oferece Squads Dedicadas Full-Stack (R$ 12.500/mês), Agentes de IA no WhatsApp com RAG pgvector (R$ 2.900/mês) e Setup de Atribuição Google Ads Offline Conversions (R$ 1.400/mês).',
    embedding: computeDeterministicEmbedding768(
      'Squads Dedicadas Full-Stack Agentes de IA WhatsApp RAG pgvector orcamento preco mensal',
    ),
  },
  {
    id: 'kb_chunk_02',
    documentId: 'doc_sla_dcf',
    documentTitle: 'Política de SLA, Segurança e LGPD.pdf',
    category: 'contract_policy',
    chunkIndex: 1,
    contentText:
      'Todos os contratos contam com assinatura eletrônica por link, criptografia AES-256-GCM em repouso, SLA de primeira resposta da IA abaixo de 10 segundos e handoff imediato para engenheiro humano.',
    embedding: computeDeterministicEmbedding768(
      'contrato assinatura digital seguranca lgpd sla resposta rapida suporte humano',
    ),
  },
];

export const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [sessionUser, setSessionUser] = useState<AuthenticatedSession | null>(null);
  const [activeTab, setActiveTab] = useState<NavTabId>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [simulatingSkeleton, setSimulatingSkeleton] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [signingModalOpen, setSigningModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [contractSignedSuccess, setContractSignedSuccess] = useState(false);
  const [aiPausedForContact, setAiPausedForContact] = useState(false);
  const [leads, setLeads] = useState<KanbanLeadCard[]>(INITIAL_LEADS);
  const [selectedLead, setSelectedLead] = useState<KanbanLeadCard | null>(null);
  const [attributionModel, setAttributionModel] = useState<AttributionModel>('last_touch');
  const [copiedPix, setCopiedPix] = useState(false);

  // Estado do Simulador IA / WhatsApp
  const [testAiInput, setTestAiInput] = useState(
    'Olá! Vi o anúncio no Google e preciso de um orçamento urgente para criar um Agente de IA no WhatsApp e um sistema SaaS em São Paulo.',
  );
  const [systemPrompt, setSystemPrompt] = useState(
    'Você é o Arquiteto Comercial Autônomo da DC Foundry Digital. Qualifique o lead coletando nome, empresa, escopo desejado (SaaS, IA WhatsApp, Squad Dedicada), prazo e urgência. Consulte sempre a base RAG pgvector antes de responder valores.',
  );
  const [promptVersion, setPromptVersion] = useState(3);
  const [aiSimulationResult, setAiSimulationResult] = useState(() =>
    processInboundWhatsAppWithAi({
      contactId: 'cnt_demo_01',
      contactName: 'Ricardo Vasconcelos',
      aiPaused: false,
      rawMessageText:
        'Olá! Preciso de um orçamento urgente para um Agente de IA no WhatsApp e Squad Full-Stack em São Paulo.',
      knowledgeBase: INITIAL_KB_CHUNKS,
      promptVersion: 3,
    }),
  );

  // Estado de Migração Legada crm_records
  const [migrationExecuted, setMigrationExecuted] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setCommandOpen(false);
        setSigningModalOpen(false);
        setQrModalOpen(false);
        setSelectedLead(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!sessionUser) {
    return <LoginPage onAuthenticated={setSessionUser} />;
  }

  const navGroups: Array<{
    groupTitle: string;
    items: Array<{
      id: NavTabId;
      label: string;
      badge?: string;
      icon: React.ComponentType<{ size?: number }>;
    }>;
  }> = [
    {
      groupTitle: 'Comercial & Operação',
      items: [
        { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
        { id: 'kanban', label: 'Funil & Leads', badge: `${leads.length}`, icon: KanbanSquare },
        { id: 'contracts', label: 'Propostas & Contratos', badge: '3 ativos', icon: FileSignature },
        { id: 'finance', label: 'Financeiro & Pix', icon: CreditCard },
      ],
    },
    {
      groupTitle: 'Atendimento & IA',
      items: [
        { id: 'whatsapp', label: 'Inbox WhatsApp', badge: '3.8s', icon: MessageSquare },
        { id: 'ai_console', label: 'Console IA & RAG', badge: `v${promptVersion}`, icon: Cpu },
      ],
    },
    {
      groupTitle: 'Growth & Governança',
      items: [
        { id: 'marketing', label: 'Google Ads & ROI', badge: '6.8x', icon: TrendingUp },
        { id: 'blog', label: 'Blog & SEO', icon: BookOpen },
        { id: 'audit', label: 'Auditoria, RBAC & LGPD', icon: ShieldCheck },
      ],
    },
  ];

  const allNavItems = navGroups.flatMap((g) => g.items);

  const advanceLeadStage = (id: string) => {
    const order: KanbanLeadCard['stage'][] = [
      'novo',
      'qualificado_ia',
      'orcamento',
      'contrato_ativo',
    ];
    setLeads((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const idx = order.indexOf(item.stage);
        const nextStage = order[Math.min(order.length - 1, idx + 1)] ?? item.stage;
        return { ...item, stage: nextStage };
      }),
    );
  };

  const runLiveAiSimulation = () => {
    const res = processInboundWhatsAppWithAi({
      contactId: 'cnt_demo_01',
      contactName: 'Ricardo Vasconcelos',
      aiPaused: aiPausedForContact,
      rawMessageText: testAiInput,
      knowledgeBase: INITIAL_KB_CHUNKS,
      promptVersion,
    });
    setAiSimulationResult(res);
    if (res.handoff.shouldHandoff) {
      setAiPausedForContact(true);
    }
  };

  const campaignMetrics = [
    calculateCampaignRoiMetrics({
      campaignId: 'CMP-01',
      campaignName: 'Search - Engenharia de Software & SaaS',
      costCents: 385000,
      clicks: 640,
      totalLeads: 48,
      qualifiedLeads: 31,
      closedContracts: 4,
      revenueCents: 3280000,
    }),
    calculateCampaignRoiMetrics({
      campaignId: 'CMP-02',
      campaignName: 'Search - Agentes IA WhatsApp & RAG',
      costCents: 240000,
      clicks: 510,
      totalLeads: 56,
      qualifiedLeads: 39,
      closedContracts: 5,
      revenueCents: 1450000,
    }),
  ];

  const attributionPreview = calculateAttributionShares(
    [
      {
        trackingCode: 'DCF-7A11',
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'Search - Agentes IA WhatsApp & RAG',
        gclid: 'CjwKCA_FirstTouch_01',
        capturedAtIso: '2026-10-01T10:00:00Z',
      },
      {
        trackingCode: 'DCF-9F22',
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'Search - Engenharia de Software & SaaS',
        gclid: 'CjwKCA_LastTouch_02',
        capturedAtIso: '2026-10-15T14:30:00Z',
      },
    ],
    1540000,
    attributionModel,
  );

  return (
    <div
      style={{
        height: '100dvh',
        overflow: 'hidden',
        display: 'flex',
        backgroundColor: 'var(--bg-page)',
        color: 'var(--text-primary)',
      }}
    >
      {/* SIDEBAR DESKTOP COLAPSÁVEL (Navy-950 + Pílula Deslizante Framer Motion) */}
      <aside
        className="dcf-desktop-only"
        style={{
          width: sidebarCollapsed ? 84 : 268,
          height: '100dvh',
          flexShrink: 0,
          backgroundColor: 'var(--bg-sidebar)',
          color: '#FFFFFF',
          borderRight: '1px solid var(--color-navy-700)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '20px 16px',
          transition: 'width 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div style={{ overflowY: 'auto', overflowX: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarCollapsed ? 'center' : 'space-between',
              marginBottom: '24px',
              padding: '0 4px',
            }}
          >
            <DcLogo size={36} showText={!sidebarCollapsed} subtitle="CRM & Revenue OS" />
            <button
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--color-navy-700)',
                color: '#DCE9F8',
                borderRadius: 10,
                padding: 7,
                cursor: 'pointer',
                display: 'inline-flex',
              }}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            </button>
          </div>

          {/* Botão Busca Global Ctrl+K */}
          {!sidebarCollapsed && (
            <button
              onClick={() => setCommandOpen(true)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                marginBottom: '24px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-navy-900)',
                border: '1px solid var(--color-navy-700)',
                color: '#93A8C1',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Search size={14} /> Buscar no CRM...
              </span>
              <kbd
                style={{
                  padding: '2px 7px',
                  borderRadius: 6,
                  backgroundColor: 'var(--color-navy-800)',
                  color: '#DCE9F8',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                Ctrl+K
              </kbd>
            </button>
          )}

          {/* Grupos de Navegação */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {navGroups.map((group) => (
              <div key={group.groupTitle}>
                {!sidebarCollapsed && (
                  <div
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      color: '#667789',
                      padding: '0 12px 8px',
                    }}
                  >
                    {group.groupTitle}
                  </div>
                )}
                <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        style={{
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                          gap: 12,
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-sm)',
                          border: 'none',
                          background: 'transparent',
                          color: isActive ? '#FFFFFF' : '#93A8C1',
                          fontFamily: 'var(--font-display)',
                          fontWeight: 600,
                          fontSize: '0.86rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="sidebar-glider"
                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                            style={{
                              position: 'absolute',
                              inset: 0,
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: 'var(--color-brand-blue)',
                              boxShadow: '0 10px 24px -10px rgba(29, 95, 174, 0.85)',
                              zIndex: 0,
                            }}
                          />
                        )}
                        <span style={{ position: 'relative', zIndex: 1, display: 'inline-flex' }}>
                          <Icon size={17} />
                        </span>
                        {!sidebarCollapsed && (
                          <span style={{ position: 'relative', zIndex: 1, flex: 1 }}>
                            {item.label}
                          </span>
                        )}
                        {!sidebarCollapsed && item.badge && (
                          <span
                            className="tnum"
                            style={{
                              position: 'relative',
                              zIndex: 1,
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 999,
                              backgroundColor: isActive
                                ? 'rgba(255,255,255,0.22)'
                                : 'var(--color-navy-800)',
                              color: '#DCE9F8',
                            }}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>
            ))}
          </div>
        </div>

        {/* Rodapé da Sidebar */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-navy-900)',
            border: '1px solid var(--color-navy-700)',
            fontSize: '0.75rem',
            color: '#DCE9F8',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: '#14B8A6',
                boxShadow: '0 0 10px #14B8A6',
              }}
            />
            {!sidebarCollapsed && 'Baileys + IA RAG Online'}
          </div>
          {!sidebarCollapsed && (
            <div style={{ marginTop: 4, color: '#93A8C1', fontSize: 11 }}>
              {sessionUser.fullName}
            </div>
          )}
        </div>
      </aside>

      {/* ÁREA PRINCIPAL COM SCROLL INDEPENDENTE E ESPAÇAMENTO GENEROSO */}
      <div
        style={{
          flex: 1,
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {/* Topbar Limpa e Elegante */}
        <header
          style={{
            height: 68,
            flexShrink: 0,
            backgroundColor: 'var(--bg-card)',
            borderBottom: '1px solid var(--border-default)',
            padding: '0 36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className="dcf-mobile-only">
              <DcLogo size={30} showText={false} />
            </div>
            <h1
              className="serif-editorial"
              style={{ fontSize: '1.45rem', margin: 0, color: 'var(--text-primary)' }}
            >
              <Mark>{allNavItems.find((n) => n.id === activeTab)?.label}</Mark>
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Seletor RBAC discreto */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-default)',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--text-secondary)',
              }}
            >
              <ShieldCheck size={14} color="var(--brand-primary)" />
              <span>Papel:</span>
              <select
                value={sessionUser.roles[0]}
                onChange={(e) =>
                  setSessionUser({ ...sessionUser, roles: [e.target.value as RoleName] })
                }
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontWeight: 800,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r} style={{ color: '#0B1E33' }}>
                    {r.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSimulatingSkeleton((s) => !s)}
            >
              <Layers size={14} />
              {simulatingSkeleton ? 'Ocultar Skeletons' : 'Skeletons'}
            </Button>

            <Button variant="outline" size="sm" onClick={() => toggleTheme()}>
              {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
              {theme === 'light' ? 'Escuro' : 'Claro'}
            </Button>

            <Button variant="ghost" size="sm" onClick={() => setSessionUser(null)}>
              <LogOut size={14} /> Sair
            </Button>
          </div>
        </header>

        {/* Canvas de Conteúdo Rolável e Espaçoso */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '36px 40px 96px',
          }}
        >
          <div style={{ maxWidth: 1380, margin: '0 auto' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* =========================================================
                    ABA 1: VISÃO GERAL (DASHBOARD EXECUTIVO)
                   ========================================================= */}
                {activeTab === 'dashboard' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                    {/* Linha de 4 KPIs Espaçosos */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                        gap: '24px',
                      }}
                    >
                      {simulatingSkeleton ? (
                        <>
                          <KpiCardSkeleton />
                          <KpiCardSkeleton />
                          <KpiCardSkeleton />
                          <KpiCardSkeleton />
                        </>
                      ) : (
                        <>
                          <Card style={{ padding: '28px' }}>
                            <span
                              style={{
                                fontSize: '0.74rem',
                                color: 'var(--text-muted)',
                                fontWeight: 700,
                                letterSpacing: '0.06em',
                              }}
                            >
                              RECEITA RECORRENTE (MRR ATIVO)
                            </span>
                            <div
                              style={{
                                fontSize: '2rem',
                                margin: '12px 0',
                                color: 'var(--brand-primary)',
                              }}
                            >
                              <AnimatedCounter
                                value={64800}
                                formatter={(v) =>
                                  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                }
                              />
                            </div>
                            <Badge tone="teal">
                              <TrendingUp size={12} /> +24,6% vs mês anterior
                            </Badge>
                          </Card>

                          <Card style={{ padding: '28px' }}>
                            <span
                              style={{
                                fontSize: '0.74rem',
                                color: 'var(--text-muted)',
                                fontWeight: 700,
                                letterSpacing: '0.06em',
                              }}
                            >
                              PIPELINE QUALIFICADO PELA IA
                            </span>
                            <div style={{ fontSize: '2rem', margin: '12px 0' }}>
                              <AnimatedCounter
                                value={184500}
                                formatter={(v) =>
                                  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                }
                              />
                            </div>
                            <Badge tone="sky">14 oportunidades quentes</Badge>
                          </Card>

                          <Card style={{ padding: '28px' }}>
                            <span
                              style={{
                                fontSize: '0.74rem',
                                color: 'var(--text-muted)',
                                fontWeight: 700,
                                letterSpacing: '0.06em',
                              }}
                            >
                              TEMPO DE 1ª RESPOSTA (IA vs HUMANO)
                            </span>
                            <div
                              style={{
                                fontSize: '2rem',
                                margin: '12px 0',
                                color: 'var(--color-teal-700)',
                              }}
                            >
                              <AnimatedCounter value={3.8} formatter={(v) => `${v.toFixed(1)}s`} />{' '}
                              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                vs 4m10s humano
                              </span>
                            </div>
                            <Badge tone="teal">
                              <Clock size={12} /> SLA &lt; 10s em 99,4% dos leads
                            </Badge>
                          </Card>

                          <Card tone="warm" style={{ padding: '28px' }}>
                            <span
                              style={{
                                fontSize: '0.74rem',
                                color: 'var(--color-ink-soft)',
                                fontWeight: 700,
                                letterSpacing: '0.06em',
                              }}
                            >
                              ROAS GOOGLE ADS (OFFLINE UPLOAD)
                            </span>
                            <div
                              style={{
                                fontSize: '2rem',
                                margin: '12px 0',
                                color: 'var(--color-ink)',
                              }}
                            >
                              <AnimatedCounter value={6.8} formatter={(v) => `${v.toFixed(1)}x`} />
                            </div>
                            <Badge tone="warm">CPL Qualificado: R$ 89,40</Badge>
                          </Card>
                        </>
                      )}
                    </div>

                    {/* Segunda Linha: Arquitetura em Tempo Real + Ações RBAC */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
                        gap: '24px',
                      }}
                    >
                      <Card
                        tone="navy"
                        style={{
                          padding: '32px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <Badge tone="teal">
                            <Cpu size={12} /> Telemetria da Plataforma
                          </Badge>
                          <h3
                            className="serif-editorial"
                            style={{ fontSize: '1.5rem', margin: '14px 0 8px' }}
                          >
                            Fluxo Unificado: Clique Ads → WhatsApp IA → Contrato
                          </h3>
                          <p
                            style={{
                              fontSize: '0.85rem',
                              color: '#DCE9F8',
                              margin: 0,
                              lineHeight: 1.6,
                            }}
                          >
                            O código curto de rastreio acompanha o visitante desde o anúncio até a
                            assinatura digital do contrato e retorna a conversão offline via hash
                            SHA-256 para o Google Ads.
                          </p>
                        </div>
                        <FoundryArchitectureArt
                          style={{ width: '100%', maxHeight: 210, marginTop: 20 }}
                        />
                      </Card>

                      <Card
                        style={{
                          padding: '32px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <Badge tone="sky">
                            <ShieldCheck size={12} /> Governança & Operação
                          </Badge>
                          <h3
                            className="serif-editorial"
                            style={{ fontSize: '1.5rem', margin: '14px 0 8px' }}
                          >
                            Ações Rápidas Protegidas por RBAC
                          </h3>
                          <p
                            style={{
                              fontSize: '0.85rem',
                              color: 'var(--text-muted)',
                              marginBottom: 20,
                              lineHeight: 1.6,
                            }}
                          >
                            Alterne o papel ativo no seletor do topo para validar que controles sem
                            permissão são ocultados na interface pelo <code>PermissionGate</code> e
                            bloqueados com HTTP 403 na API:
                          </p>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <PermissionGate
                              subject={sessionUser}
                              permission="contract:approve"
                              fallback={
                                <Badge tone="danger">
                                  Bloqueado para {sessionUser.roles[0]}: requer contract:approve
                                </Badge>
                              }
                            >
                              <Button
                                variant="teal"
                                size="md"
                                onClick={() => setSigningModalOpen(true)}
                                style={{ justifyContent: 'space-between' }}
                              >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                  <FileSignature size={16} /> Aprovar & Assinar Contrato Digital (
                                  <code>contract:approve</code>)
                                </span>
                                <ArrowRight size={15} />
                              </Button>
                            </PermissionGate>

                            <PermissionGate
                              subject={sessionUser}
                              permission="marketing_ads:export"
                              fallback={
                                <Badge tone="danger">
                                  Bloqueado para {sessionUser.roles[0]}: requer marketing_ads:export
                                </Badge>
                              }
                            >
                              <Button
                                variant="primary"
                                size="md"
                                onClick={() => setActiveTab('marketing')}
                                style={{ justifyContent: 'space-between' }}
                              >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                  <TrendingUp size={16} /> Painel de Conversões Offline Google Ads (
                                  <code>marketing_ads:export</code>)
                                </span>
                                <ArrowRight size={15} />
                              </Button>
                            </PermissionGate>

                            <PermissionGate
                              subject={sessionUser}
                              permission="whatsapp:manage"
                              fallback={
                                <Badge tone="danger">
                                  Bloqueado para {sessionUser.roles[0]}: requer whatsapp:manage
                                </Badge>
                              }
                            >
                              <Button
                                variant="outline"
                                size="md"
                                onClick={() => setQrModalOpen(true)}
                                style={{ justifyContent: 'space-between' }}
                              >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                  <QrCode size={16} /> Parear Nova Sessão WhatsApp Baileys (
                                  <code>whatsapp:manage</code>)
                                </span>
                                <ArrowRight size={15} />
                              </Button>
                            </PermissionGate>
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-around',
                            marginTop: 24,
                            paddingTop: 20,
                            borderTop: '1px solid var(--border-default)',
                          }}
                        >
                          <DeliveryArt />
                          <ContractSignedArt />
                        </div>
                      </Card>
                    </div>
                  </div>
                )}

                {/* =========================================================
                    ABA 2: FUNIL KANBAN & FICHA LATERAL DO LEAD (LEADSHEET)
                   ========================================================= */}
                {activeTab === 'kanban' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 10 }}>
                        <Badge tone="teal">Funil Principal: Retainers & Projetos SaaS</Badge>
                        <Badge tone="sky">Deduplicação E.164 Ativa</Badge>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() =>
                          setLeads((prev) => [
                            {
                              id: `LD-${205 + prev.length}`,
                              name: 'Novo Lead via WhatsApp IA',
                              company: 'Nova Empresa Tech Ltda',
                              phone: '+55 11 99440-8811',
                              scopeSummary: 'Desenvolvimento SaaS + Integração IA',
                              modality: 'Retainer Mensal',
                              stage: 'novo',
                              score: 88,
                              temperature: 'Quente',
                              highPriority: true,
                              campaign: 'Search - Engenharia de Software & SaaS',
                              gclid: 'CjwKCA_LiveLead_99',
                              monthlyValue: 9500,
                              notes: 'Qualificado automaticamente pelo Agente de IA.',
                            },
                            ...prev,
                          ])
                        }
                      >
                        <Plus size={15} /> Novo Lead Comercial
                      </Button>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                        gap: '20px',
                      }}
                    >
                      {(
                        [
                          { key: 'novo', title: '1. Entrada (WhatsApp / Ads)', sla: 'SLA 10m' },
                          { key: 'qualificado_ia', title: '2. Qualificado pela IA', sla: 'SLA 20m' },
                          { key: 'orcamento', title: '3. Proposta Enviada', sla: 'SLA 60m' },
                          { key: 'contrato_ativo', title: '4. Contrato Fechado', sla: 'Ganho' },
                        ] as const
                      ).map((col) => {
                        const colLeads = leads.filter((l) => l.stage === col.key);
                        return (
                          <div
                            key={col.key}
                            style={{
                              backgroundColor: 'var(--bg-subtle)',
                              border: '1px solid var(--border-default)',
                              borderRadius: 'var(--radius-md)',
                              padding: '20px',
                              minHeight: 480,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '16px',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                              }}
                            >
                              <strong
                                style={{
                                  fontSize: '0.9rem',
                                  fontFamily: 'var(--font-display)',
                                }}
                              >
                                {col.title}
                              </strong>
                              <Badge tone={col.key === 'contrato_ativo' ? 'teal' : 'sky'}>
                                {col.sla}
                              </Badge>
                            </div>

                            <AnimatePresence>
                              {colLeads.map((lead) => (
                                <motion.div
                                  key={lead.id}
                                  layout
                                  initial={{ opacity: 0, scale: 0.96 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.92 }}
                                  transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                                >
                                  <Card style={{ padding: '20px' }}>
                                    <div
                                      style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        gap: 8,
                                        marginBottom: 10,
                                      }}
                                    >
                                      <Badge
                                        tone={lead.temperature === 'Quente' ? 'teal' : 'warm'}
                                      >
                                        {lead.temperature} • Score {lead.score}
                                      </Badge>
                                      {lead.highPriority && (
                                        <Badge tone="danger">Urgência Alta</Badge>
                                      )}
                                    </div>

                                    <h4 style={{ margin: '0 0 4px', fontSize: '0.98rem' }}>
                                      {lead.company}
                                    </h4>
                                    <div
                                      style={{
                                        fontSize: '0.78rem',
                                        color: 'var(--text-muted)',
                                        marginBottom: 10,
                                      }}
                                    >
                                      {lead.name} • {lead.phone}
                                    </div>

                                    <p
                                      style={{
                                        margin: '0 0 12px',
                                        fontSize: '0.82rem',
                                        color: 'var(--text-secondary)',
                                        lineHeight: 1.5,
                                      }}
                                    >
                                      {lead.scopeSummary}
                                    </p>

                                    <div
                                      style={{
                                        fontSize: '0.72rem',
                                        color: 'var(--text-muted)',
                                        marginBottom: 14,
                                        padding: '6px 10px',
                                        borderRadius: 8,
                                        backgroundColor: 'var(--bg-subtle)',
                                      }}
                                    >
                                      Campanha: <strong>{lead.campaign}</strong>
                                    </div>

                                    <div
                                      style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: 8,
                                      }}
                                    >
                                      <strong
                                        className="tnum"
                                        style={{
                                          color: 'var(--brand-primary)',
                                          fontSize: '0.95rem',
                                        }}
                                      >
                                        R$ {lead.monthlyValue.toLocaleString('pt-BR')}
                                      </strong>

                                      <div style={{ display: 'flex', gap: 6 }}>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => setSelectedLead(lead)}
                                        >
                                          <Eye size={14} /> Ficha
                                        </Button>
                                        {lead.stage !== 'contrato_ativo' && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => advanceLeadStage(lead.id)}
                                          >
                                            Avançar <ArrowRight size={13} />
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  </Card>
                                </motion.div>
                              ))}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* =========================================================
                    ABA 3: INBOX WHATSAPP MULTI-SESSÃO (BAILEYS + PAUSA IA)
                   ========================================================= */}
                {activeTab === 'whatsapp' && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                      gap: '24px',
                    }}
                  >
                    <Card style={{ padding: '28px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 20,
                          flexWrap: 'wrap',
                          gap: 12,
                        }}
                      >
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                            Ricardo Vasconcelos — Vortex Fintech
                          </h3>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            +55 11 99812-3401 • Código de Rastreio: <code>[DCF-9F22]</code>
                          </span>
                        </div>
                        <Badge tone={aiPausedForContact ? 'warm' : 'teal'}>
                          {aiPausedForContact
                            ? 'IA Pausada (Handoff Humano)'
                            : 'IA Ativa (Gemini 2.5 + RAG)'}
                        </Badge>
                      </div>

                      <div
                        style={{
                          backgroundColor: 'var(--bg-subtle)',
                          borderRadius: 'var(--radius-md)',
                          padding: '20px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 14,
                          marginBottom: 20,
                        }}
                      >
                        <div
                          style={{
                            alignSelf: 'flex-start',
                            maxWidth: '82%',
                            backgroundColor: 'var(--bg-card)',
                            padding: '14px 16px',
                            borderRadius: '16px 16px 16px 4px',
                            border: '1px solid var(--border-default)',
                            fontSize: '0.88rem',
                            lineHeight: 1.55,
                          }}
                        >
                          Olá! Vi o anúncio da DC Foundry Digital no Google e precisamos de uma
                          Squad Full-Stack e um Agente de IA no WhatsApp integrado ao nosso banco
                          de dados.
                        </div>

                        <div
                          style={{
                            alignSelf: 'flex-end',
                            maxWidth: '84%',
                            backgroundColor: 'var(--color-brand-blue)',
                            color: '#FFFFFF',
                            padding: '14px 16px',
                            borderRadius: '16px 16px 4px 16px',
                            fontSize: '0.88rem',
                            lineHeight: 1.55,
                          }}
                        >
                          <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 6 }}>
                            Assistente IA • DC Foundry Digital CRM (Fonte RAG:{' '}
                            <code>doc_catalogo_dcf#chunk_0</code>)
                          </div>
                          Olá, Ricardo! Temos disponibilidade imediata para alocar a{' '}
                          <strong>Squad Alpha Full-Stack & IA</strong> (Retainer de R$ 12.500/mês)
                          ou implementar o <strong>Agente Autônomo WhatsApp com RAG pgvector</strong>{' '}
                          (R$ 2.900/mês). Posso gerar o link da proposta técnica agora?
                        </div>

                        {!aiPausedForContact && (
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                              fontSize: '0.78rem',
                              color: 'var(--color-teal-700)',
                              fontWeight: 700,
                            }}
                          >
                            <Sparkles size={14} /> Tool Call Zod executada:{' '}
                            <code>
                              upsertLeadAndContact(score=96) + movePipelineStage(&quot;qualificado_ia&quot;)
                            </code>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <Button
                          variant={aiPausedForContact ? 'teal' : 'outline'}
                          size="sm"
                          onClick={() => setAiPausedForContact((p) => !p)}
                        >
                          {aiPausedForContact ? (
                            <>
                              <PlayCircle size={15} /> Retomar Agente IA (<code>ai_paused = false</code>)
                            </>
                          ) : (
                            <>
                              <PauseCircle size={15} /> Assumir Humano / Pausar IA (
                              <code>ai_paused = true</code>)
                            </>
                          )}
                        </Button>

                        <Button variant="primary" size="sm" onClick={() => setQrModalOpen(true)}>
                          <QrCode size={15} /> Gerenciar Sessões Baileys / QR Code
                        </Button>
                      </div>
                    </Card>

                    <Card style={{ padding: '28px' }}>
                      <h3 className="serif-editorial" style={{ marginTop: 0, fontSize: '1.35rem' }}>
                        Simulador ao Vivo do Agente de IA (`@dcfoundry/ai`)
                      </h3>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        Envie uma mensagem abaixo para executar o motor real de RAG, qualificação,
                        mascaramento de CPF/telefone (LGPD) e detecção de handoff humano:
                      </p>

                      <textarea
                        rows={3}
                        value={testAiInput}
                        onChange={(e) => setTestAiInput(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-strong)',
                          backgroundColor: 'var(--bg-page)',
                          color: 'var(--text-primary)',
                          fontSize: '0.86rem',
                          marginBottom: 12,
                        }}
                      />

                      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                        <Button variant="primary" size="sm" onClick={runLiveAiSimulation}>
                          <Send size={14} /> Executar Inferência IA + RAG
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setTestAiInput(
                              'Quero falar com um atendente humano urgente, meu CPF é 123.456.789-00.',
                            )
                          }
                        >
                          Testar Handoff + Mascaramento CPF
                        </Button>
                      </div>

                      <div
                        style={{
                          padding: '16px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--bg-subtle)',
                          border: '1px solid var(--border-default)',
                          fontSize: '0.8rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div>
                          <strong>Entrada Mascarada (LGPD):</strong>{' '}
                          <code>{aiSimulationResult.maskedInputText}</code>
                        </div>
                        <div>
                          <strong>Score Calculado:</strong> {aiSimulationResult.qualification.score}/100 (
                          {aiSimulationResult.qualification.temperature.toUpperCase()}) •{' '}
                          <strong>Latência:</strong> {aiSimulationResult.latencyMs}ms
                        </div>
                        <div>
                          <strong>Chunks RAG Citados:</strong>{' '}
                          <code>{aiSimulationResult.citedChunkIds.join(', ') || 'nenhum'}</code>
                        </div>
                        <div>
                          <strong>Resposta Gerada:</strong> {aiSimulationResult.replyText}
                        </div>
                      </div>
                    </Card>
                  </div>
                )}

                {/* =========================================================
                    ABA 4: CONSOLE IA & BASE DE CONHECIMENTO RAG (PGVECTOR)
                   ========================================================= */}
                {activeTab === 'ai_console' && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
                      gap: '24px',
                    }}
                  >
                    <Card style={{ padding: '28px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 16,
                        }}
                      >
                        <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                          Prompt de Sistema Versionado por Sessão
                        </h3>
                        <Badge tone="teal">Versão v{promptVersion} Ativa</Badge>
                      </div>
                      <textarea
                        rows={5}
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '14px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-strong)',
                          backgroundColor: 'var(--bg-page)',
                          color: 'var(--text-primary)',
                          fontSize: '0.86rem',
                          lineHeight: 1.6,
                          marginBottom: 14,
                        }}
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setPromptVersion((v) => v + 1)}
                      >
                        <Check size={14} /> Salvar Nova Versão (v{promptVersion + 1}) no Audit Log
                      </Button>
                    </Card>

                    <Card style={{ padding: '28px' }}>
                      <h3 style={{ marginTop: 0, fontSize: '1.15rem' }}>
                        Base de Conhecimento RAG Indexada em `pgvector` (768d HNSW)
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {INITIAL_KB_CHUNKS.map((chunk) => (
                          <div
                            key={chunk.id}
                            style={{
                              padding: '14px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: 'var(--bg-subtle)',
                              border: '1px solid var(--border-default)',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: 6,
                              }}
                            >
                              <strong style={{ fontSize: '0.84rem' }}>{chunk.documentTitle}</strong>
                              <Badge tone="sky">{chunk.category}</Badge>
                            </div>
                            <p
                              style={{
                                margin: 0,
                                fontSize: '0.8rem',
                                color: 'var(--text-secondary)',
                                lineHeight: 1.5,
                              }}
                            >
                              {chunk.contentText}
                            </p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                )}

                {/* =========================================================
                    ABA 5: PROPOSTAS, CONTRATOS & ALOCAÇÃO SEM SOBREPOSIÇÃO
                   ========================================================= */}
                {activeTab === 'contracts' && (
                  <Card style={{ padding: '28px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 20,
                        flexWrap: 'wrap',
                        gap: 12,
                      }}
                    >
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                          Contratos Ativos & Alocação de Squads / Clusters (`EXCLUDE USING gist`)
                        </h3>
                        <p
                          style={{
                            margin: '4px 0 0',
                            fontSize: '0.8rem',
                            color: 'var(--text-muted)',
                          }}
                        >
                          Constraint GiST no PostgreSQL garante que nenhuma Squad ou Nó Dedicado
                          sofra sobreposição de reserva no mesmo período.
                        </p>
                      </div>
                      <Button variant="primary" size="sm" onClick={() => setSigningModalOpen(true)}>
                        <FileSignature size={15} /> Abrir Link Público de Assinatura
                      </Button>
                    </div>

                    {simulatingSkeleton ? (
                      <TableListSkeleton rows={4} />
                    ) : (
                      <ResponsiveTable
                        rowKey={(r) => r.code}
                        data={[
                          {
                            code: 'CTR-2026-0042',
                            client: 'Krono Capital',
                            resource: 'SQUAD-BETA (Squad Dedicada Full-Stack)',
                            period: '01/10/2026 → 30/09/2027',
                            status: 'Ativo (Assinado)',
                            mrr: 'R$ 12.500,00',
                          },
                          {
                            code: 'CTR-2026-0043',
                            client: 'Vortex Fintech S.A.',
                            resource: 'SQUAD-ALPHA (Squad Dedicada + IA RAG)',
                            period: '17/10/2026 → 17/10/2027',
                            status: 'Aguardando Assinatura',
                            mrr: 'R$ 15.400,00',
                          },
                          {
                            code: 'CTR-2026-0039',
                            client: 'MedPrime Diagnósticos',
                            resource: 'NODE-AI-02 (Instância WhatsApp + RAG)',
                            period: '20/10/2025 → 20/10/2026',
                            status: 'Renovação em 3 dias',
                            mrr: 'R$ 4.800,00',
                          },
                        ]}
                        columns={[
                          { key: 'code', header: 'Contrato', render: (r) => <code>{r.code}</code> },
                          {
                            key: 'client',
                            header: 'Cliente',
                            render: (r) => <strong>{r.client}</strong>,
                          },
                          { key: 'resource', header: 'Recurso Alocado', render: (r) => r.resource },
                          { key: 'period', header: 'Vigência', render: (r) => r.period },
                          {
                            key: 'status',
                            header: 'Status',
                            render: (r) => (
                              <Badge
                                tone={
                                  r.status.startsWith('Ativo')
                                    ? 'teal'
                                    : r.status.includes('Renovação')
                                      ? 'warm'
                                      : 'sky'
                                }
                              >
                                {r.status}
                              </Badge>
                            ),
                          },
                          {
                            key: 'mrr',
                            header: 'Valor Mensal',
                            render: (r) => <strong className="tnum">{r.mrr}</strong>,
                          },
                        ]}
                      />
                    )}
                  </Card>
                )}

                {/* =========================================================
                    ABA 6: FINANCEIRO, PIX MERCADO PAGO & LEMBRETES AUTOMÁTICOS
                   ========================================================= */}
                {activeTab === 'finance' && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
                      gap: '24px',
                    }}
                  >
                    <Card style={{ padding: '28px' }}>
                      <h3 style={{ marginTop: 0, fontSize: '1.15rem' }}>
                        Faturas Recorrentes & Conciliação Pix / Boleto (Mercado Pago)
                      </h3>
                      <ResponsiveTable
                        rowKey={(r) => r.invoice}
                        data={[
                          {
                            invoice: 'FAT-2026-881',
                            client: 'Krono Capital',
                            dueDate: '20/10/2026',
                            amount: 'R$ 12.500,00',
                            status: 'Pago via Pix',
                          },
                          {
                            invoice: 'FAT-2026-882',
                            client: 'MedPrime Diagnósticos',
                            dueDate: '17/10/2026',
                            amount: 'R$ 4.800,00',
                            status: 'Vence Hoje (Lembrete WA Enviado)',
                          },
                        ]}
                        columns={[
                          {
                            key: 'invoice',
                            header: 'Fatura',
                            render: (r) => <code>{r.invoice}</code>,
                          },
                          {
                            key: 'client',
                            header: 'Cliente',
                            render: (r) => <strong>{r.client}</strong>,
                          },
                          { key: 'dueDate', header: 'Vencimento', render: (r) => r.dueDate },
                          {
                            key: 'amount',
                            header: 'Valor',
                            render: (r) => <strong className="tnum">{r.amount}</strong>,
                          },
                          {
                            key: 'status',
                            header: 'Status',
                            render: (r) => (
                              <Badge tone={r.status.startsWith('Pago') ? 'teal' : 'warm'}>
                                {r.status}
                              </Badge>
                            ),
                          },
                        ]}
                      />
                      <div style={{ marginTop: 18 }}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCopiedPix(true);
                            setTimeout(() => setCopiedPix(false), 2000);
                          }}
                        >
                          {copiedPix ? <Check size={14} /> : <Copy size={14} />}
                          {copiedPix
                            ? 'Código Pix Copia-e-Cola Copiado!'
                            : 'Copiar Pix Copia-e-Cola (FAT-2026-882)'}
                        </Button>
                      </div>
                    </Card>

                    <Card tone="warm" style={{ padding: '28px' }}>
                      <h3 className="serif-editorial" style={{ marginTop: 0, fontSize: '1.35rem' }}>
                        Régua Automática de Cobrança e Renovação via WhatsApp
                      </h3>
                      <p
                        style={{
                          fontSize: '0.84rem',
                          color: 'var(--color-ink-soft)',
                          lineHeight: 1.6,
                        }}
                      >
                        O job agendado no Worker avalia diariamente contratos e faturas (testado com
                        relógio simulado em <code>evaluateDueReminders</code>):
                      </p>
                      <ul
                        style={{
                          fontSize: '0.82rem',
                          lineHeight: 1.8,
                          color: 'var(--color-ink)',
                          paddingLeft: 18,
                        }}
                      >
                        <li>
                          <strong>D-3 da Renovação:</strong> Dispara proposta de renovação
                          automática do contrato via WhatsApp.
                        </li>
                        <li>
                          <strong>D0 (Dia do Vencimento):</strong> Envia lembrete amigável com Pix
                          Copia-e-Cola.
                        </li>
                        <li>
                          <strong>D+2 de Atraso:</strong> Notifica financeiro e envia segunda via
                          atualizada ao responsável.
                        </li>
                      </ul>
                    </Card>
                  </div>
                )}

                {/* =========================================================
                    ABA 7: MARKETING, GOOGLE ADS & CONVERSÕES OFFLINE
                   ========================================================= */}
                {activeTab === 'marketing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <Card style={{ padding: '28px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 20,
                          flexWrap: 'wrap',
                          gap: 12,
                        }}
                      >
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                            ROI, CPL, CAC e ROAS por Campanha Google Ads + Upload Offline SHA-256
                          </h3>
                          <p
                            style={{
                              margin: '4px 0 0',
                              fontSize: '0.8rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            Link WhatsApp decorado pelo snippet:{' '}
                            <code>
                              {decorateWhatsAppLinkWithTrackingCode(
                                'https://wa.me/5511999998888',
                                'DCF-9F22',
                              )}
                            </code>
                          </p>
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                          {(
                            [
                              { id: 'first_touch', label: 'First Touch' },
                              { id: 'last_touch', label: 'Last Touch' },
                              { id: 'linear', label: 'Linear' },
                            ] as const
                          ).map((m) => (
                            <Button
                              key={m.id}
                              size="sm"
                              variant={attributionModel === m.id ? 'primary' : 'outline'}
                              onClick={() => setAttributionModel(m.id)}
                            >
                              <Filter size={13} /> {m.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <ResponsiveTable
                        rowKey={(r) => r.campaignId}
                        data={campaignMetrics}
                        columns={[
                          {
                            key: 'campaignName',
                            header: 'Campanha Google Ads',
                            render: (r) => <strong>{r.campaignName}</strong>,
                          },
                          {
                            key: 'cost',
                            header: 'Investimento',
                            render: (r) => (
                              <span className="tnum">
                                {(r.costCents / 100).toLocaleString('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL',
                                })}
                              </span>
                            ),
                          },
                          {
                            key: 'leads',
                            header: 'Leads / Qualif.',
                            render: (r) => `${r.totalLeads} / ${r.qualifiedLeads}`,
                          },
                          {
                            key: 'cpl',
                            header: 'CPL Qualif.',
                            render: (r) => (
                              <span className="tnum">
                                {(r.costPerQualifiedLeadCents / 100).toLocaleString('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL',
                                })}
                              </span>
                            ),
                          },
                          {
                            key: 'cac',
                            header: 'CAC',
                            render: (r) => (
                              <span className="tnum">
                                {(r.cacCents / 100).toLocaleString('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL',
                                })}
                              </span>
                            ),
                          },
                          {
                            key: 'rev',
                            header: 'Receita Fechada',
                            render: (r) => (
                              <strong className="tnum">
                                {(r.revenueCents / 100).toLocaleString('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL',
                                })}
                              </strong>
                            ),
                          },
                          {
                            key: 'roas',
                            header: 'ROAS',
                            render: (r) => <Badge tone="teal">{r.roasMultiplier}x</Badge>,
                          },
                        ]}
                      />

                      <div
                        style={{
                          marginTop: 20,
                          padding: '14px 18px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--bg-subtle)',
                          fontSize: '0.8rem',
                        }}
                      >
                        <strong>
                          Simulação de Crédito ({attributionModel.toUpperCase()}) para Contrato de
                          R$ 15.400,00:
                        </strong>{' '}
                        {attributionPreview.map((s, idx) => (
                          <span key={idx} style={{ marginLeft: 12 }}>
                            • {s.campaign}:{' '}
                            <strong>
                              {(s.attributedValueCents / 100).toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })}{' '}
                              ({Math.round(s.weight * 100)}%)
                            </strong>
                          </span>
                        ))}
                      </div>
                    </Card>
                  </div>
                )}

                {/* =========================================================
                    ABA 8: GERENCIADOR DO BLOG & CONTEÚDO SEO
                   ========================================================= */}
                {activeTab === 'blog' && (
                  <Card style={{ padding: '28px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 20,
                      }}
                    >
                      <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                        Gerenciador de Artigos SEO (`dcfoundrydigital.com/blog`)
                      </h3>
                      <Badge tone="teal">Sincronizado com o Site</Badge>
                    </div>
                    <ResponsiveTable
                      rowKey={(r) => r.slug}
                      data={[
                        {
                          slug: 'arquitetura-rag-pgvector-whatsapp',
                          title:
                            'Como construímos Agentes de IA no WhatsApp com latência abaixo de 4s usando pgvector',
                          status: 'Publicado',
                          views: '3.420 leituras',
                        },
                        {
                          slug: 'atribuicao-offline-google-ads-crm',
                          title:
                            'Atribuição Ponta a Ponta: Ligando o gclid do Google Ads ao Contrato Assinado',
                          status: 'Publicado',
                          views: '2.190 leituras',
                        },
                      ]}
                      columns={[
                        {
                          key: 'title',
                          header: 'Título do Artigo',
                          render: (r) => <strong>{r.title}</strong>,
                        },
                        { key: 'slug', header: 'Slug', render: (r) => <code>/{r.slug}</code> },
                        {
                          key: 'status',
                          header: 'Status',
                          render: (r) => <Badge tone="teal">{r.status}</Badge>,
                        },
                        { key: 'views', header: ' Alcance', render: (r) => r.views },
                      ]}
                    />
                  </Card>
                )}

                {/* =========================================================
                    ABA 9: AUDITORIA IMUTÁVEL, RBAC, LGPD & MIGRAÇÃO LEGADA
                   ========================================================= */}
                {activeTab === 'audit' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <Card style={{ padding: '28px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 18,
                          flexWrap: 'wrap',
                          gap: 12,
                        }}
                      >
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                            Migrador Sem Perda do Legado `crm_records` JSONB (Fase 7)
                          </h3>
                          <p
                            style={{
                              margin: '4px 0 0',
                              fontSize: '0.8rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            Converte registros JSONB antigos para tabelas relacionais normalizadas
                            com deduplicação de telefone E.164.
                          </p>
                        </div>
                        <Button
                          variant={migrationExecuted ? 'teal' : 'primary'}
                          size="sm"
                          onClick={() => setMigrationExecuted(true)}
                        >
                          <Database size={15} />
                          {migrationExecuted
                            ? 'Migração Verificada: 0 Perdas (100% Relacional)'
                            : 'Executar Teste de Migração crm_records'}
                        </Button>
                      </div>
                    </Card>

                    <Card style={{ padding: '28px' }}>
                      <h3 style={{ marginTop: 0, fontSize: '1.15rem' }}>
                        Trilha de Auditoria Imutável (`audit_logs` com Trigger Append-Only)
                      </h3>
                      <PermissionGate
                        subject={sessionUser}
                        permission="audit_log:read"
                        fallback={
                          <Badge tone="danger">
                            <AlertTriangle size={13} /> Acesso negado: o papel `
                            {sessionUser.roles[0]}` não possui a permissão `audit_log:read`.
                          </Badge>
                        }
                      >
                        <ResponsiveTable
                          rowKey={(r) => r.id}
                          data={[
                            {
                              id: 'AUD-901',
                              when: 'Agora',
                              actor: sessionUser.email,
                              action: 'auth.login_success',
                              entity: `user:${sessionUser.userId.slice(0, 8)}`,
                              diff: '{"lastLoginAt":{"before":null,"after":"2026-10-17"}}',
                            },
                            {
                              id: 'AUD-902',
                              when: 'Há 2 min',
                              actor: 'vitor@dcfoundrydigital.com',
                              action: 'contract.approve',
                              entity: 'contract:CTR-2026-0042',
                              diff: '{"status":{"before":"pending_signature","after":"active"}}',
                            },
                            {
                              id: 'AUD-903',
                              when: 'Há 5 min',
                              actor: 'ai_agent:gemini-2.5-flash',
                              action: 'lead.qualify_and_move_stage',
                              entity: 'lead:LD-201',
                              diff: '{"stage":{"before":"novo","after":"qualificado_ia"},"score":{"before":0,"after":96}}',
                            },
                          ]}
                          columns={[
                            { key: 'when', header: 'Horário', render: (r) => r.when },
                            {
                              key: 'actor',
                              header: 'Ator / Origem',
                              render: (r) => <strong>{r.actor}</strong>,
                            },
                            {
                              key: 'action',
                              header: 'Ação',
                              render: (r) => <Badge tone="sky">{r.action}</Badge>,
                            },
                            {
                              key: 'entity',
                              header: 'Entidade',
                              render: (r) => <code>{r.entity}</code>,
                            },
                            {
                              key: 'diff',
                              header: 'Diff (Antes → Depois)',
                              render: (r) => <code style={{ fontSize: 11 }}>{r.diff}</code>,
                            },
                          ]}
                        />
                      </PermissionGate>
                    </Card>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* BOTTOM NAVIGATION MOBILE (<860px) */}
      <nav
        className="dcf-mobile-only"
        aria-label="Navegação inferior mobile"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          backgroundColor: 'var(--color-navy-950)',
          borderTop: '1px solid var(--color-navy-700)',
          padding: '8px 10px',
          justifyContent: 'space-around',
          alignItems: 'center',
        }}
      >
        {allNavItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                position: 'relative',
                background: 'transparent',
                border: 'none',
                color: isActive ? '#FFFFFF' : '#93A8C1',
                padding: '8px 12px',
                borderRadius: 12,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isActive && (
                <motion.span
                  layoutId="bottom-nav-glider"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 12,
                    backgroundColor: 'var(--color-brand-blue)',
                    zIndex: 0,
                  }}
                />
              )}
              <span style={{ position: 'relative', zIndex: 1 }}>
                <Icon size={17} />
              </span>
              <span style={{ position: 'relative', zIndex: 1 }}>{item.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </nav>

      {/* DRAWER LATERAL SPRING: FICHA COMPLETA DO LEAD (LEADSHEET) */}
      <AnimatePresence>
        {selectedLead && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedLead(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 60,
              backgroundColor: 'rgba(6, 21, 40, 0.65)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 480,
                height: '100dvh',
                backgroundColor: 'var(--bg-card)',
                borderLeft: '1px solid var(--border-default)',
                padding: '32px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 20,
                  }}
                >
                  <Badge tone="teal">LeadSheet • {selectedLead.id}</Badge>
                  <button
                    onClick={() => setSelectedLead(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    <X size={20} />
                  </button>
                </div>

                <h2 className="serif-editorial" style={{ margin: '0 0 6px', fontSize: '1.6rem' }}>
                  {selectedLead.company}
                </h2>
                <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Responsável: <strong>{selectedLead.name}</strong> ({selectedLead.phone})
                </p>

                <div
                  style={{
                    padding: '16px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-subtle)',
                    border: '1px solid var(--border-default)',
                    marginBottom: 20,
                    fontSize: '0.84rem',
                    lineHeight: 1.6,
                  }}
                >
                  <div>
                    <strong>Escopo Solicitado:</strong> {selectedLead.scopeSummary}
                  </div>
                  <div>
                    <strong>Campanha / GCLID:</strong> <code>{selectedLead.gclid}</code>
                  </div>
                  <div>
                    <strong>Notas Técnicas (AES-256-GCM):</strong> {selectedLead.notes}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    setSelectedLead(null);
                    setSigningModalOpen(true);
                  }}
                  style={{ flex: 1 }}
                >
                  <FileSignature size={16} /> Converter em Contrato Digital
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL SPRING: PAREAMENTO QR CODE WHATSAPP BAILEYS */}
      <AnimatePresence>
        {qrModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setQrModalOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 60,
              backgroundColor: 'rgba(6, 21, 40, 0.72)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 440 }}
            >
              <Card style={{ padding: '32px', textAlign: 'center' }}>
                <DcLogo size={34} subtitle="Multi-Sessão Baileys" />
                <h3 className="serif-editorial" style={{ fontSize: '1.4rem', margin: '16px 0 8px' }}>
                  Pareamento de Sessão WhatsApp
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 20 }}>
                  As chaves de autenticação são persistidas criptografadas com AES-256-GCM na
                  tabela <code>whatsapp_auth_credentials</code> no PostgreSQL.
                </p>

                <div
                  style={{
                    width: 168,
                    height: 168,
                    margin: '0 auto 20px',
                    padding: 16,
                    borderRadius: 16,
                    backgroundColor: '#FFFFFF',
                    border: '2px solid var(--brand-primary)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <QrCode size={124} color="#061528" />
                </div>

                <Badge tone="teal">Sessão Comercial Principal Conectada</Badge>

                <div style={{ marginTop: 22 }}>
                  <Button variant="primary" size="md" onClick={() => setQrModalOpen(false)}>
                    Concluir
                  </Button>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL SPRING: ASSINATURA PÚBLICA DE CONTRATO POR LINK */}
      <AnimatePresence>
        {signingModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setSigningModalOpen(false);
              setContractSignedSuccess(false);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 60,
              backgroundColor: 'rgba(6, 21, 40, 0.72)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 480 }}
            >
              <Card style={{ padding: '32px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 16,
                  }}
                >
                  <DcLogo size={32} subtitle="Assinatura Eletrônica por Link" />
                  <Badge tone="teal">CTR-2026-0043</Badge>
                </div>

                {contractSignedSuccess ? (
                  <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <ContractSignedArt style={{ margin: '0 auto 12px', display: 'block' }} />
                    <h3
                      className="serif-editorial"
                      style={{ fontSize: '1.45rem', margin: '10px 0' }}
                    >
                      <CheckCircle2
                        size={20}
                        style={{ verticalAlign: 'middle', color: 'var(--color-teal-700)' }}
                      />{' '}
                      Contrato Assinado Digitalmente!
                    </h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      Hash SHA-256 e IP gravados no Audit Log imutável + Conversão Offline{' '}
                      <code>contrato_fechado</code> enfileirada para o Google Ads.
                    </p>
                    <Button
                      variant="teal"
                      size="md"
                      onClick={() => {
                        setSigningModalOpen(false);
                        setContractSignedSuccess(false);
                      }}
                    >
                      Fechar
                    </Button>
                  </div>
                ) : (
                  <div>
                    <h3 className="serif-editorial" style={{ margin: '8px 0', fontSize: '1.35rem' }}>
                      Retainer Squad Dedicada Full-Stack & IA (`SQUAD-ALPHA`)
                    </h3>
                    <p
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.6,
                      }}
                    >
                      Contratante: <strong>Vortex Fintech S.A.</strong> • Vigência: 12 meses •
                      Valor Mensal: <strong>R$ 15.400,00</strong>.
                    </p>
                    <div
                      style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSigningModalOpen(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setContractSignedSuccess(true)}
                      >
                        <Check size={15} /> Assinar Digitalmente Agora
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL SPRING: BUSCA GLOBAL CTRL+K */}
      <AnimatePresence>
        {commandOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCommandOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 60,
              backgroundColor: 'rgba(6, 21, 40, 0.68)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              paddingTop: '12vh',
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: -12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -12 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 540, padding: '0 16px' }}
            >
              <Card style={{ padding: '24px' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}
                >
                  <Search size={18} />
                  <input
                    autoFocus
                    placeholder="Buscar empresas, contratos (CTR-2026), squads ou módulos..."
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: 'var(--text-primary)',
                      fontSize: '0.95rem',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {allNavItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id);
                          setCommandOpen(false);
                        }}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: 'none',
                          backgroundColor: 'var(--bg-subtle)',
                          color: 'var(--text-primary)',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: '0.82rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                          <Icon size={15} /> {item.label}
                        </span>
                        <ArrowRight size={14} />
                      </button>
                    );
                  })}
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
