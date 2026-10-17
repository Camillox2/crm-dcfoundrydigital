import { type ReactNode } from 'react';
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  CreditCard,
  FileSignature,
  Home,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
  CalendarDays,
  Layers,
  Globe,
  LineChart,
  Settings,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { DcLogo, useTheme } from '@dcfoundry/ui';
import { resolveGrantedScope, type WorkspacePage, type PermissionKey } from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../pages/LoginPage.js';

export const navigation = [
  {
    title: 'Comercial',
    items: [
      { id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard },
      { id: 'kanban', label: 'Funil & leads', icon: KanbanSquare },
      { id: 'contracts', label: 'Propostas & contratos', icon: FileSignature },
      { id: 'finance', label: 'Financeiro', icon: CreditCard },
      { id: 'projects', label: 'Projetos & entregas', icon: Layers },
      { id: 'agenda', label: 'Agenda & tarefas', icon: CalendarDays },
    ],
  },
  {
    title: 'Atendimento',
    items: [
      { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
      { id: 'portal', label: 'Portal & solicitações', icon: Globe },
      { id: 'ai_console', label: 'Foundry IA', icon: Sparkles },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { id: 'marketing', label: 'Marketing & Ads', icon: BarChart3 },
      { id: 'reports', label: 'Relatórios & gráficos', icon: LineChart },
      { id: 'site', label: 'Site & SEO', icon: Globe },
      { id: 'blog', label: 'Blog & conteúdo', icon: BookOpen },
      { id: 'audit', label: 'Auditoria', icon: ShieldCheck },
      { id:'settings',label:'Configurações',icon:Settings },
    ],
  },
] as const;
export const allNavigation = navigation.flatMap((group) => [...group.items]);
const pageReadPermission: Record<WorkspacePage, PermissionKey> = {
  dashboard: 'lead:read',
  kanban: 'lead:read',
  contracts: 'contract:read',
  finance: 'finance:read',
  whatsapp: 'whatsapp:read',
  portal: 'task:read',
  ai_console: 'ai_agent:read',
  marketing: 'marketing_ads:read',
  blog: 'blog:read',
  audit: 'audit_log:read',
  reports: 'lead:read',
  projects: 'task:read',
  agenda: 'task:read',
  site: 'marketing_ads:read',
  settings:'settings:read',
};
export function canNavigate(user: AuthenticatedSession, page: WorkspacePage) {
  if (page === 'reports')
    return Boolean(
      user.preview ||
        ['lead:read', 'finance:read', 'task:read', 'blog:read', 'marketing_ads:read'].some(
          (permission) => resolveGrantedScope(user.roles, permission as PermissionKey),
        ),
    );
  return Boolean(user.preview || resolveGrantedScope(user.roles, pageReadPermission[page]));
}

export function WorkspaceShell({
  page,
  user,
  collapsed,
  mobileOpen,
  accountOpen,
  onCollapse,
  onMobile,
  onAccount,
  onSearch,
  onLogout,
  onNavigate,
  children,
}: {
  page: WorkspacePage;
  user: AuthenticatedSession;
  collapsed: boolean;
  mobileOpen: boolean;
  accountOpen: boolean;
  onCollapse: () => void;
  onMobile: (open: boolean) => void;
  onAccount: () => void;
  onSearch: () => void;
  onLogout: () => void;
  onNavigate: (page: WorkspacePage) => void;
  children: ReactNode;
}) {
  const { theme, toggleTheme } = useTheme();
  const nameParts = user.fullName.split(' ');
  const shortName = `${nameParts[0]} ${nameParts.length > 1 ? nameParts.at(-1) : ''}`.trim();
  const navButton = (item: (typeof allNavigation)[number], mobile = false) => {
    const Icon = item.icon;
    return (
      <button
        className={mobile ? '' : 'sidebar-nav-item'}
        type="button"
        key={item.id}
        title={item.label}
        aria-current={page === item.id ? 'page' : undefined}
        onClick={() => {
          onNavigate(item.id);
          onMobile(false);
        }}
      >
        <Icon size={18} />
        {(!collapsed || mobile) && <span>{item.label}</span>}
      </button>
    );
  };
  return (
    <div className="crm-shell clean-shell" data-collapsed={collapsed}>
      <aside className="dcf-desktop-only crm-sidebar">
        <div>
          <div className="sidebar-brand">
            <DcLogo size={31} showText={!collapsed} subtitle="CRM" />
            <button
              type="button"
              className="icon-button sidebar-collapse"
              onClick={onCollapse}
              aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
              aria-expanded={!collapsed}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
          {!collapsed && (
            <button type="button" className="sidebar-search" onClick={onSearch}>
              <Search size={14} />
              <span>Buscar no CRM...</span>
              <kbd>Ctrl+K</kbd>
            </button>
          )}
          <div className="sidebar-groups">
            {navigation
              .filter((group) => group.items.some((item) => canNavigate(user, item.id)))
              .map((group) => (
                <div className="sidebar-group" key={group.title}>
                  {!collapsed && <div>{group.title}</div>}
                  <nav aria-label={group.title}>
                    {group.items
                      .filter((item) => canNavigate(user, item.id))
                      .map((item) => navButton(item))}
                  </nav>
                </div>
              ))}
          </div>
        </div>
        <div className="sidebar-profile">
          <span className="profile-dot" />
          {!collapsed && (
            <span>
              <strong>{shortName}</strong>
              <small>{user.preview ? 'Prévia local' : 'DC Foundry Digital'}</small>
            </span>
          )}
        </div>
      </aside>
      <div className="workspace-column">
        <header className="crm-topbar">
          <div className="workspace-breadcrumb">
            <button
              type="button"
              className="icon-button mobile-menu-trigger"
              aria-label="Abrir navegação"
              aria-expanded={mobileOpen}
              onClick={() => onMobile(true)}
            >
              <Menu size={21} />
            </button>
            <Home size={16} />
            <span>Workspace</span>
            <ChevronRight size={13} />
            <h1>{allNavigation.find((item) => item.id === page)?.label}</h1>
          </div>
          <div className="topbar-actions">
            <span className="demo-indicator">
              <i />
              {user.localReview
                ? 'Dados de revisão'
                : user.preview
                  ? 'Prévia local'
                  : 'Seu workspace'}
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Buscar no CRM"
              onClick={onSearch}
            >
              <Search size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
              onClick={() => toggleTheme()}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <div className="account-menu-wrap">
              <button
                type="button"
                className="user-avatar"
                aria-label="Abrir minha conta"
                aria-expanded={accountOpen}
                onClick={onAccount}
              >
                {[nameParts[0]?.[0], nameParts.length > 1 ? nameParts.at(-1)?.[0] : ''].join('')}
              </button>
              {accountOpen && (
                <section className="account-menu" aria-label="Minha conta">
                  <strong>{user.fullName}</strong>
                  <span>{user.email || 'Interface local, sem sessão de produção'}</span>
                  <span>Perfil: {user.preview ? 'visualização' : user.roles.join(', ')}</span>
                  <button type="button" onClick={onLogout}>
                    <LogOut size={15} />
                    Sair da sessão
                  </button>
                </section>
              )}
            </div>
          </div>
        </header>
        {children}
      </div>
      <nav className="crm-mobile-nav" aria-label="Navegação inferior">
        {allNavigation
          .filter(
            (item) =>
              ['dashboard', 'kanban', 'whatsapp', 'blog'].includes(item.id) &&
              canNavigate(user, item.id),
          )
          .map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={page === item.id ? 'page' : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <Icon size={20} />
                <span>
                  {item.id === 'dashboard'
                    ? 'Início'
                    : item.id === 'kanban'
                      ? 'Funil'
                      : item.id === 'blog'
                        ? 'Blog'
                        : 'WhatsApp'}
                </span>
              </button>
            );
          })}
        <button type="button" aria-expanded={mobileOpen} onClick={() => onMobile(true)}>
          <Menu size={20} />
          <span>Mais</span>
        </button>
      </nav>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="mobile-menu-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onMobile(false)}
          >
            <motion.section
              className="mobile-menu-panel"
              data-crm-dialog
              role="dialog"
              aria-modal="true"
              aria-label="Todas as áreas do CRM"
              initial={{ x: -24 }}
              animate={{ x: 0 }}
              exit={{ x: -24 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="panel-heading">
                <DcLogo size={30} subtitle="CRM" />
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Fechar navegação"
                  onClick={() => onMobile(false)}
                >
                  <X size={20} />
                </button>
              </div>
              {navigation
                .filter((group) => group.items.some((item) => canNavigate(user, item.id)))
                .map((group) => (
                  <div className="mobile-nav-group" key={group.title}>
                    <p>{group.title}</p>
                    {group.items
                      .filter((item) => canNavigate(user, item.id))
                      .map((item) => navButton(item, true))}
                  </div>
                ))}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
