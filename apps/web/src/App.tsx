import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard,
  KanbanSquare,
  MessageSquare,
  Bed,
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
} from 'lucide-react';
import {
  AnimatedCounter,
  Badge,
  BedArt,
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
import { PermissionGate } from './components/PermissionGate.js';
import { LoginPage, type AuthenticatedSession } from './pages/LoginPage.js';
import '@dcfoundry/ui/tokens.css';

type NavTabId = 'dashboard' | 'kanban' | 'whatsapp' | 'operations' | 'marketing' | 'audit';

interface KanbanLeadCard {
  id: string;
  name: string;
  phone: string;
  equipment: string;
  modality: 'Locação' | 'Venda';
  stage: 'novo' | 'qualificado_ia' | 'orcamento' | 'contrato_ativo';
  score: number;
  temperature: 'Quente' | 'Morno' | 'Frio';
  urgentDischarge: boolean;
  campaign: string;
  monthlyValue: number;
}

const INITIAL_LEADS: KanbanLeadCard[] = [
  {
    id: 'LD-101',
    name: 'Dra. Helena Vasconcelos (Familiar)',
    phone: '+55 11 99812-3401',
    equipment: 'Cama Motorizada 3 Movimentos + Colchão Pneumático',
    modality: 'Locação',
    stage: 'qualificado_ia',
    score: 94,
    temperature: 'Quente',
    urgentDischarge: true,
    campaign: 'gclid:CjwKCA_Cama_Hospitalar_SP',
    monthlyValue: 620,
  },
  {
    id: 'LD-102',
    name: 'Carlos Eduardo Mendes',
    phone: '+55 11 98741-9022',
    equipment: 'Concentrador de Oxigênio 5L/min',
    modality: 'Locação',
    stage: 'orcamento',
    score: 86,
    temperature: 'Quente',
    urgentDischarge: true,
    campaign: 'utm:google_search_oxigenio_homecare',
    monthlyValue: 420,
  },
  {
    id: 'LD-103',
    name: 'Clínica Santa Clara (PJ)',
    phone: '+55 11 97110-5500',
    equipment: '3x Cama Manual 2 Manivelas',
    modality: 'Venda',
    stage: 'novo',
    score: 78,
    temperature: 'Morno',
    urgentDischarge: false,
    campaign: 'gclid:CjwKCA_Venda_Hospitalar',
    monthlyValue: 9870,
  },
  {
    id: 'LD-104',
    name: 'Roberto Almeida (Pós-Cirúrgico)',
    phone: '+55 11 99200-1188',
    equipment: 'Cama Motorizada 3 Movimentos',
    modality: 'Locação',
    stage: 'contrato_ativo',
    score: 98,
    temperature: 'Quente',
    urgentDischarge: false,
    campaign: 'gclid:CjwKCA_Cama_Motorizada',
    monthlyValue: 490,
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
  const [contractSignedSuccess, setContractSignedSuccess] = useState(false);
  const [aiPausedForContact, setAiPausedForContact] = useState(false);
  const [leads, setLeads] = useState<KanbanLeadCard[]>(INITIAL_LEADS);

  // Atalho global Ctrl+K / Cmd+K para Busca Global
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setCommandOpen(false);
        setSigningModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!sessionUser) {
    return <LoginPage onAuthenticated={setSessionUser} />;
  }

  const navItems: Array<{
    id: NavTabId;
    label: string;
    badge?: string;
    icon: React.ComponentType<{ size?: number }>;
  }> = [
    { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'kanban', label: 'Funil Kanban', badge: `${leads.length} ativos`, icon: KanbanSquare },
    { id: 'whatsapp', label: 'WhatsApp & IA', badge: '4s SLA', icon: MessageSquare },
    { id: 'operations', label: 'Estoque & Contratos', badge: '5 livres', icon: Bed },
    { id: 'marketing', label: 'Google Ads & ROI', badge: '6.4x ROAS', icon: TrendingUp },
    { id: 'audit', label: 'Auditoria & RBAC', icon: ShieldCheck },
  ];

  const advanceLeadStage = (id: string) => {
    const order: KanbanLeadCard['stage'][] = ['novo', 'qualificado_ia', 'orcamento', 'contrato_ativo'];
    setLeads((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const idx = order.indexOf(item.stage);
        const nextStage = order[Math.min(order.length - 1, idx + 1)] ?? item.stage;
        return { ...item, stage: nextStage };
      }),
    );
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        backgroundColor: 'var(--bg-page)',
        color: 'var(--text-primary)',
      }}
    >
      {/* SIDEBAR DESKTOP COLAPSÁVEL (Base Navy-950 + Pílula Deslizante Framer Motion) */}
      <aside
        className="dcf-desktop-only"
        style={{
          width: sidebarCollapsed ? 84 : 272,
          flexShrink: 0,
          backgroundColor: 'var(--bg-sidebar)',
          color: '#FFFFFF',
          borderRight: '1px solid var(--color-navy-700)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 'var(--space-4)',
          transition: 'width 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarCollapsed ? 'center' : 'space-between',
              marginBottom: 'var(--space-6)',
              padding: '4px',
            }}
          >
            <DcLogo size={36} showText={!sidebarCollapsed} subtitle="CRM Hospitalar" />
            <button
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--color-navy-700)',
                color: '#DCE9F8',
                borderRadius: 10,
                padding: 6,
                cursor: 'pointer',
              }}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
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
                padding: '10px 12px',
                marginBottom: 'var(--space-5)',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-navy-900)',
                border: '1px solid var(--color-navy-700)',
                color: '#93A8C1',
                cursor: 'pointer',
                fontSize: 'var(--text-xs)',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Search size={14} /> Buscar lead, patrimônio...
              </span>
              <kbd
                style={{
                  padding: '2px 6px',
                  borderRadius: 6,
                  backgroundColor: 'var(--color-navy-800)',
                  color: '#DCE9F8',
                  fontSize: 10,
                }}
              >
                Ctrl+K
              </kbd>
            </button>
          )}

          {/* Navegação com Pílula Deslizante (layoutId="sidebar-glider") */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {navItems.map((item) => {
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
                    padding: '11px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: 'transparent',
                    color: isActive ? '#FFFFFF' : '#93A8C1',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: 'var(--text-sm)',
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
                    <Icon size={18} />
                  </span>
                  {!sidebarCollapsed && (
                    <span style={{ position: 'relative', zIndex: 1, flex: 1 }}>{item.label}</span>
                  )}
                  {!sidebarCollapsed && item.badge && (
                    <span
                      className="tnum"
                      style={{
                        position: 'relative',
                        zIndex: 1,
                        fontSize: 10,
                        padding: '2px 8px',
                        borderRadius: 999,
                        backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'var(--color-navy-800)',
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

        {/* Status Operacional no Rodapé da Sidebar */}
        <div
          style={{
            padding: '12px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-navy-900)',
            border: '1px solid var(--color-navy-700)',
            fontSize: 'var(--text-xs)',
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
              {sessionUser.fullName} ({sessionUser.roles[0]?.toUpperCase()})
            </div>
          )}
        </div>
      </aside>

      {/* ÁREA CENTRAL + TOPBAR + CONTEÚDO COM TRANSIÇÃO DE TELA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, paddingBottom: 72 }}>
        {/* Header Superior */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            backgroundColor: 'var(--bg-card)',
            borderBottom: '1px solid var(--border-default)',
            padding: 'var(--space-3) var(--space-6)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div className="dcf-mobile-only">
              <DcLogo size={32} showText={false} />
            </div>
            <div>
              <h1
                className="serif-editorial"
                style={{ fontSize: 'var(--text-xl)', margin: 0, color: 'var(--text-primary)' }}
              >
                <Mark>{navItems.find((n) => n.id === activeTab)?.label}</Mark>
              </h1>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <label
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-secondary)',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              Simular Papel RBAC:
              <select
                value={sessionUser.roles[0]}
                onChange={(e) =>
                  setSessionUser({ ...sessionUser, roles: [e.target.value as RoleName] })
                }
                style={{
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-subtle)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-strong)',
                  fontWeight: 700,
                }}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSimulatingSkeleton((s) => !s)}
            >
              {simulatingSkeleton ? '✓ Ocultar Skeletons' : '⏳ Testar Skeletons'}
            </Button>

            <Button variant="teal" size="sm" onClick={() => toggleTheme()}>
              {theme === 'light' ? '🌙 Escuro (Navy)' : '☀️ Claro'}
            </Button>

            <Button variant="ghost" size="sm" onClick={() => setSessionUser(null)}>
              Sair
            </Button>
          </div>
        </header>

        {/* Conteúdo da Aba com Transição Fluida Framer Motion (AnimatePresence) */}
        <main style={{ maxWidth: 1360, width: '100%', margin: '0 auto', padding: 'var(--space-6)' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* ABA 1: VISÃO GERAL (DASHBOARD) */}
              {activeTab === 'dashboard' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                  {/* KPIs com Stagger e AnimatedCounter */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(235px, 1fr))',
                      gap: 'var(--space-4)',
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
                        <Card>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 700 }}>
                            RECEITA RECORRENTE (MRR LOCAÇÃO)
                          </span>
                          <div style={{ fontSize: 'var(--text-2xl)', margin: '8px 0', color: 'var(--brand-primary)' }}>
                            <AnimatedCounter
                              value={48950}
                              formatter={(v) =>
                                v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                              }
                            />
                          </div>
                          <Badge tone="teal">+18,4% vs mês anterior</Badge>
                        </Card>

                        <Card>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 700 }}>
                            TAXA DE OCUPAÇÃO DE CAMAS
                          </span>
                          <div style={{ fontSize: 'var(--text-2xl)', margin: '8px 0' }}>
                            <AnimatedCounter value={87} formatter={(v) => `${Math.round(v)}%`} />
                          </div>
                          <Badge tone="sky">42 de 48 unidades locadas</Badge>
                        </Card>

                        <Card>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 700 }}>
                            1ª RESPOSTA IA vs HUMANO
                          </span>
                          <div style={{ fontSize: 'var(--text-2xl)', margin: '8px 0', color: 'var(--color-teal-700)' }}>
                            <AnimatedCounter value={4} formatter={(v) => `${Math.round(v)}s`} />{' '}
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>vs 3m12s</span>
                          </div>
                          <Badge tone="teal">SLA &lt; 10s cumprido em 99,2%</Badge>
                        </Card>

                        <Card tone="warm">
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-soft)', fontWeight: 700 }}>
                            ROAS GOOGLE ADS (ENHANCED CONVERSIONS)
                          </span>
                          <div style={{ fontSize: 'var(--text-2xl)', margin: '8px 0', color: 'var(--color-ink)' }}>
                            <AnimatedCounter value={6.4} formatter={(v) => `${v.toFixed(1)}x`} />
                          </div>
                          <Badge tone="warm">CPL Qualificado: R$ 19,80</Badge>
                        </Card>
                      </>
                    )}
                  </div>

                  {/* Vitrine de Ilustrações Vetoriais Animadas + Ações RBAC */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
                      gap: 'var(--space-4)',
                    }}
                  >
                    <Card tone="navy" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <Badge tone="teal">Arte Vetorial Interativa</Badge>
                        <h3 className="serif-editorial" style={{ fontSize: 'var(--text-xl)', margin: '10px 0 4px' }}>
                          Cama Motorizada 3 Movimentos
                        </h3>
                        <p style={{ fontSize: 'var(--text-xs)', color: '#DCE9F8', margin: 0 }}>
                          Articulação contínua de encosto, joelho e elevação respeitando `prefers-reduced-motion`.
                        </p>
                      </div>
                      <BedArt style={{ width: '100%', maxHeight: 170, marginTop: 12 }} />
                    </Card>

                    <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <Badge tone="sky">Logística & Assinatura Digital</Badge>
                        <h3 className="serif-editorial" style={{ fontSize: 'var(--text-xl)', margin: '10px 0 4px' }}>
                          Operação Home Care Ponta a Ponta
                        </h3>
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
                          Da rota de entrega com fotos até o link público de assinatura eletrônica sem sobreposição de estoque.
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', margin: '16px 0' }}>
                        <DeliveryArt />
                        <ContractSignedArt />
                      </div>
                      <Button variant="primary" size="sm" onClick={() => setSigningModalOpen(true)}>
                        <FileSignature size={15} /> Testar Modal de Assinatura por Link
                      </Button>
                    </Card>

                    <Card>
                      <Badge tone="warm">Segurança RBAC em Tempo Real</Badge>
                      <h3 className="serif-editorial" style={{ fontSize: 'var(--text-xl)', margin: '10px 0 4px' }}>
                        Controle de Acesso (`PermissionGate`)
                      </h3>
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 14 }}>
                        Troque o papel RBAC no topo da tela para ver os botões aparecerem ou sumirem instantaneamente:
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <PermissionGate
                          subject={sessionUser}
                          permission="contract:approve"
                          fallback={<Badge tone="danger">🔒 Oculto para {sessionUser.roles[0]}: exige contract:approve</Badge>}
                        >
                          <Button variant="teal" size="sm" onClick={() => setSigningModalOpen(true)}>
                            ✓ Aprovar Contrato (`contract:approve`)
                          </Button>
                        </PermissionGate>

                        <PermissionGate
                          subject={sessionUser}
                          permission="marketing_ads:export"
                          fallback={<Badge tone="danger">🔒 Oculto para {sessionUser.roles[0]}: exige marketing_ads:export</Badge>}
                        >
                          <Button variant="primary" size="sm" onClick={() => setActiveTab('marketing')}>
                            📊 Exportar Conversões Offline Ads (`marketing_ads:export`)
                          </Button>
                        </PermissionGate>

                        <PermissionGate
                          subject={sessionUser}
                          permission="logistics:update"
                          fallback={<Badge tone="danger">🔒 Oculto para {sessionUser.roles[0]}: exige logistics:update</Badge>}
                        >
                          <Button variant="outline" size="sm" onClick={() => setActiveTab('operations')}>
                            🚚 Confirmar Entrega com Checklist (`logistics:update`)
                          </Button>
                        </PermissionGate>
                      </div>
                    </Card>
                  </div>
                </div>
              )}

              {/* ABA 2: FUNIL KANBAN COM LAYOUT ANIMATIONS */}
              {activeTab === 'kanban' && (
                <div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                      gap: 'var(--space-4)',
                    }}
                  >
                    {(
                      [
                        { key: 'novo', title: '1. Novo Contato (WA/Ads)', sla: 'SLA 10m' },
                        { key: 'qualificado_ia', title: '2. Qualificado pela IA', sla: 'SLA 20m' },
                        { key: 'orcamento', title: '3. Orçamento Enviado', sla: 'SLA 60m' },
                        { key: 'contrato_ativo', title: '4. Contrato Ativo / Entregue', sla: 'Ganho ✓' },
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
                            padding: 'var(--space-4)',
                            minHeight: 420,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'var(--space-3)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-display)' }}>
                              {col.title}
                            </strong>
                            <Badge tone={col.key === 'contrato_ativo' ? 'teal' : 'sky'}>{col.sla}</Badge>
                          </div>

                          <AnimatePresence>
                            {colLeads.map((lead) => (
                              <motion.div
                                key={lead.id}
                                layout
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                              >
                                <Card style={{ padding: 'var(--space-4)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                    <Badge tone={lead.temperature === 'Quente' ? 'teal' : 'warm'}>
                                      🔥 {lead.temperature} • Score {lead.score}
                                    </Badge>
                                    {lead.urgentDischarge && <Badge tone="danger">Alta Hospitalar</Badge>}
                                  </div>
                                  <h4 style={{ margin: '10px 0 4px', fontSize: 'var(--text-sm)' }}>{lead.name}</h4>
                                  <p style={{ margin: '0 0 8px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                                    {lead.equipment}
                                  </p>
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                                    🎯 Atribuição: <code>{lead.campaign}</code>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <strong className="tnum" style={{ color: 'var(--brand-primary)', fontSize: 'var(--text-sm)' }}>
                                      R$ {lead.monthlyValue.toLocaleString('pt-BR')}/mês
                                    </strong>
                                    {lead.stage !== 'contrato_ativo' && (
                                      <Button size="sm" variant="outline" onClick={() => advanceLeadStage(lead.id)}>
                                        Avançar Etapa →
                                      </Button>
                                    )}
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

              {/* ABA 3: WHATSAPP & AGENTE DE IA (RAG + PAUSA POR CONTATO) */}
              {activeTab === 'whatsapp' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
                  <Card>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: 'var(--text-base)' }}>Dra. Helena Vasconcelos</h3>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                          +55 11 99812-3401 • Código Rastreio: <code>[DCF-982A]</code>
                        </span>
                      </div>
                      <Badge tone={aiPausedForContact ? 'warm' : 'teal'}>
                        {aiPausedForContact ? '⏸ IA Pausada (Handoff Humano)' : '🤖 IA Ativa (Gemini 2.5 + RAG)'}
                      </Badge>
                    </div>

                    <div
                      style={{
                        backgroundColor: 'var(--bg-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: 'var(--space-4)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                        marginBottom: 14,
                      }}
                    >
                      <div
                        style={{
                          alignSelf: 'flex-start',
                          maxWidth: '82%',
                          backgroundColor: 'var(--bg-card)',
                          padding: '10px 14px',
                          borderRadius: '14px 14px 14px 4px',
                          border: '1px solid var(--border-default)',
                          fontSize: 'var(--text-sm)',
                        }}
                      >
                        Olá! Meu pai terá alta hospitalar amanhã no Morumbi e precisamos alugar uma cama motorizada de 3 movimentos com urgência.
                      </div>

                      <div
                        style={{
                          alignSelf: 'flex-end',
                          maxWidth: '84%',
                          backgroundColor: 'var(--color-brand-blue)',
                          color: '#FFFFFF',
                          padding: '10px 14px',
                          borderRadius: '14px 14px 4px 14px',
                          fontSize: 'var(--text-sm)',
                        }}
                      >
                        <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 4 }}>
                          🤖 Assistente IA • DC Foundry Digital CRM (Fonte RAG: <code>catalogo_camas_2026.pdf#chunk_4</code>)
                        </div>
                        Olá, Dra. Helena! Temos <strong>1 unidade disponível imediata</strong> da Cama Motorizada 3 Movimentos (Patrimônio <code>PAT-0001</code>, higienizada hoje). O valor mensal é R$ 490,00 com entrega expressa no Morumbi em até 4h. Deseja que eu gere o link do contrato?
                      </div>

                      {!aiPausedForContact && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-xs)', color: 'var(--color-teal-700)', fontWeight: 700 }}>
                          <Sparkles size={14} /> Tool Call executada: <code>qualifyLead(score=94, urgency=&quot;hospital_discharge&quot;)</code>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <Button
                        variant={aiPausedForContact ? 'teal' : 'outline'}
                        size="sm"
                        onClick={() => setAiPausedForContact((p) => !p)}
                      >
                        {aiPausedForContact ? (
                          <>
                            <PlayCircle size={15} /> Retomar Agente IA (`ai_paused = false`)
                          </>
                        ) : (
                          <>
                            <PauseCircle size={15} /> Assumir Atendimento / Pausar IA (`ai_paused = true`)
                          </>
                        )}
                      </Button>
                    </div>
                  </Card>

                  <Card tone="warm">
                    <h3 className="serif-editorial" style={{ marginTop: 0 }}>
                      Auditoria do Agente de IA (`ai_audit_logs`)
                    </h3>
                    <ul style={{ fontSize: 'var(--text-xs)', lineHeight: 1.8, paddingLeft: 18, color: 'var(--color-ink-soft)' }}>
                      <li>
                        <strong>Mascaramento LGPD antes do LLM:</strong> CPF e telefone substituídos por <code>[CPF_MASCARADO]</code> antes do envio para a API Gemini.
                      </li>
                      <li>
                        <strong>Memória do Cliente (`ai_client_memories`):</strong> Bairro Morumbi, urgência de alta hospitalar, preferência por locação mensal.
                      </li>
                      <li>
                        <strong>Sessão Baileys Criptografada:</strong> Credenciais salvas em <code>whatsapp_auth_credentials</code> com AES-256-GCM no PostgreSQL.
                      </li>
                    </ul>
                  </Card>
                </div>
              )}

              {/* ABA 4: ESTOQUE DE EQUIPAMENTOS & CONTRATOS (TABELA RESPONSIVA -> CARDS NO MOBILE) */}
              {activeTab === 'operations' && (
                <Card>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>
                        Unidades de Patrimônio Serializadas (Proteção GiST Anti-Sobreposição)
                      </h3>
                      <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        Redimensione a janela para &lt;860px para ver a tabela se transformar automaticamente em cards mobile.
                      </p>
                    </div>
                    <Button variant="primary" size="sm" onClick={() => setSigningModalOpen(true)}>
                      <FileSignature size={15} /> Abrir Assinatura Pública por Link
                    </Button>
                  </div>

                  {simulatingSkeleton ? (
                    <TableListSkeleton rows={4} />
                  ) : (
                    <ResponsiveTable
                      rowKey={(r) => r.assetTag}
                      data={[
                        {
                          assetTag: 'PAT-0001',
                          serial: 'SN-EL3M-2026-001',
                          name: 'Cama Hospitalar Motorizada 3 Movimentos',
                          status: 'Disponível',
                          monthly: 'R$ 490,00',
                        },
                        {
                          assetTag: 'PAT-0002',
                          serial: 'SN-EL3M-2026-002',
                          name: 'Cama Hospitalar Motorizada 3 Movimentos',
                          status: 'Alugado (CTR-2026-0042)',
                          monthly: 'R$ 490,00',
                        },
                        {
                          assetTag: 'PAT-0003',
                          serial: 'SN-EL3M-2026-003',
                          name: 'Cama Hospitalar Motorizada 3 Movimentos',
                          status: 'Em Higienização',
                          monthly: 'R$ 490,00',
                        },
                        {
                          assetTag: 'PAT-0050',
                          serial: 'SN-CPNE-2026-050',
                          name: 'Colchão Pneumático Anti-Escaras',
                          status: 'Disponível',
                          monthly: 'R$ 130,00',
                        },
                      ]}
                      columns={[
                        { key: 'assetTag', header: 'Patrimônio', render: (r) => <code>{r.assetTag}</code> },
                        { key: 'name', header: 'Equipamento', render: (r) => <strong>{r.name}</strong> },
                        { key: 'serial', header: 'Nº Série', render: (r) => r.serial },
                        {
                          key: 'status',
                          header: 'Status',
                          render: (r) => (
                            <Badge
                              tone={
                                r.status === 'Disponível'
                                  ? 'teal'
                                  : r.status.startsWith('Alugado')
                                    ? 'sky'
                                    : 'warm'
                              }
                            >
                              {r.status}
                            </Badge>
                          ),
                        },
                        { key: 'monthly', header: 'Locação Mensal', render: (r) => <span className="tnum">{r.monthly}</span> },
                      ]}
                    />
                  )}
                </Card>
              )}

              {/* ABA 5: MARKETING, GOOGLE ADS & CONVERSÕES OFFLINE */}
              {activeTab === 'marketing' && (
                <Card>
                  <h3 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>
                    Atribuição Ponta a Ponta (Clique `gclid` → WhatsApp → Contrato → Google Ads Offline Upload)
                  </h3>
                  <ResponsiveTable
                    rowKey={(r) => r.campaign}
                    data={[
                      {
                        campaign: 'Search - Cama Hospitalar SP',
                        spend: 'R$ 2.450,00',
                        leads: 62,
                        qualified: 41,
                        cpl: 'R$ 39,51',
                        revenue: 'R$ 18.620,00',
                        roas: '7.6x',
                        offlineStatus: 'Enviado (SHA-256 Enhanced)',
                      },
                      {
                        campaign: 'Search - Locação Home Care Urgente',
                        spend: 'R$ 1.890,00',
                        leads: 48,
                        qualified: 33,
                        cpl: 'R$ 39,37',
                        revenue: 'R$ 9.150,00',
                        roas: '4.8x',
                        offlineStatus: 'Enviado (SHA-256 Enhanced)',
                      },
                    ]}
                    columns={[
                      { key: 'campaign', header: 'Campanha Google Ads', render: (r) => <strong>{r.campaign}</strong> },
                      { key: 'spend', header: 'Investimento', render: (r) => <span className="tnum">{r.spend}</span> },
                      { key: 'leads', header: 'Leads / Qualif.', render: (r) => `${r.leads} / ${r.qualified}` },
                      { key: 'cpl', header: 'CPL', render: (r) => <span className="tnum">{r.cpl}</span> },
                      { key: 'revenue', header: 'Receita Fechada', render: (r) => <strong className="tnum">{r.revenue}</strong> },
                      { key: 'roas', header: 'ROAS', render: (r) => <Badge tone="teal">{r.roas}</Badge> },
                      { key: 'offline', header: 'Upload Offline Ads', render: (r) => <Badge tone="sky">{r.offlineStatus}</Badge> },
                    ]}
                  />
                </Card>
              )}

              {/* ABA 6: AUDITORIA IMUTÁVEL & MATRIZ RBAC */}
              {activeTab === 'audit' && (
                <Card>
                  <h3 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>
                    Trilha de Auditoria Imutável (`audit_logs` com Trigger Append-Only)
                  </h3>
                  <PermissionGate
                    subject={sessionUser}
                    permission="audit_log:read"
                    fallback={
                      <Badge tone="danger">
                        Acesso negado: o papel `{sessionUser.roles[0]}` não possui a permissão `audit_log:read`.
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
                          entity: 'lead:LD-101',
                          diff: '{"stage":{"before":"novo","after":"qualificado_ia"},"score":{"before":0,"after":94}}',
                        },
                      ]}
                      columns={[
                        { key: 'when', header: 'Horário', render: (r) => r.when },
                        { key: 'actor', header: 'Ator / Origem', render: (r) => <strong>{r.actor}</strong> },
                        { key: 'action', header: 'Ação', render: (r) => <Badge tone="sky">{r.action}</Badge> },
                        { key: 'entity', header: 'Entidade', render: (r) => <code>{r.entity}</code> },
                        { key: 'diff', header: 'Diff (Antes → Depois)', render: (r) => <code style={{ fontSize: 11 }}>{r.diff}</code> },
                      ]}
                    />
                  </PermissionGate>
                </Card>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* BOTTOM NAVIGATION MOBILE (Visível em telas <860px) */}
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
          padding: '6px 8px',
          justifyContent: 'space-around',
          alignItems: 'center',
        }}
      >
        {navItems.slice(0, 5).map((item) => {
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
                padding: '8px 10px',
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
                <Icon size={18} />
              </span>
              <span style={{ position: 'relative', zIndex: 1 }}>{item.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </nav>

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
              padding: 'var(--space-4)',
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
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <DcLogo size={32} subtitle="Assinatura Eletrônica por Link" />
                  <Badge tone="teal">CTR-2026-0042</Badge>
                </div>

                {contractSignedSuccess ? (
                  <div style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
                    <ContractSignedArt style={{ margin: '0 auto 12px', display: 'block' }} />
                    <h3 className="serif-editorial" style={{ fontSize: 'var(--text-xl)', margin: '8px 0' }}>
                      <CheckCircle2 size={20} style={{ verticalAlign: 'middle', color: 'var(--color-teal-700)' }} />{' '}
                      Contrato Assinado com Sucesso!
                    </h3>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Hash SHA-256 e IP registrados no Audit Log imutável + Conversão Offline <code>contrato_fechado</code> enfileirada para o Google Ads.
                    </p>
                    <Button
                      variant="teal"
                      size="md"
                      onClick={() => {
                        setSigningModalOpen(false);
                        setContractSignedSuccess(false);
                      }}
                    >
                      Concluir
                    </Button>
                  </div>
                ) : (
                  <div>
                    <h3 className="serif-editorial" style={{ margin: '8px 0' }}>
                      Locação de Cama Motorizada 3 Movimentos (`PAT-0001`)
                    </h3>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      Locatária: <strong>Dra. Helena Vasconcelos</strong> • Período: 30 dias (Renovação automática) • Valor: <strong>R$ 490,00/mês</strong>.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                      <Button variant="outline" size="sm" onClick={() => setSigningModalOpen(false)}>
                        Fechar
                      </Button>
                      <Button variant="primary" size="sm" onClick={() => setContractSignedSuccess(true)}>
                        Assinar Digitalmente Agora ✓
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
              style={{ width: '100%', maxWidth: 520, padding: '0 16px' }}
            >
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <Search size={18} />
                  <input
                    autoFocus
                    placeholder="Buscar leads, contratos (CTR-2026), patrimônio (PAT-0001)..."
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      color: 'var(--text-primary)',
                      fontSize: 'var(--text-base)',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {navItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setCommandOpen(false);
                      }}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: 'none',
                        backgroundColor: 'var(--bg-subtle)',
                        color: 'var(--text-primary)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      Ir para {item.label} →
                    </button>
                  ))}
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
