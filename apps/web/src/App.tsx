import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Eye,
  Plus,
  Search,
  X,
  Edit3,
  Download,
  MessageSquare,
  Archive,
} from 'lucide-react';
import { Badge, Button, Card } from '@dcfoundry/ui';
import {
  CreateWorkspaceLeadSchema,
  resolveGrantedScope,
  type WorkspaceLead,
  type WorkspacePage,
} from '@dcfoundry/shared';
import { LoginPage, type AuthenticatedSession } from './pages/LoginPage.js';
import { WorkspaceShell, allNavigation, canNavigate } from './components/WorkspaceShell.js';
import { ModuleIntro } from './components/ModuleIntro.js';
import { FloatingFoundry } from './components/FloatingFoundry.js';
import { ContactAvatar } from './components/ContactAvatar.js';
import { useWorkspace } from './components/useWorkspace.js';
import { useDialogFocus } from './components/useDialogFocus.js';
import '@dcfoundry/ui/tokens.css';
import './workspace.css';
import './modules.css';
import './operations.css';
import './agency.css';
import { downloadCsv } from './components/modules/useModule.js';
const BlogStudio = lazy(() =>
  import('./components/modules/BlogStudio.js').then((m) => ({
    default: m.BlogStudio,
  })),
);
const RecordsModule = lazy(() =>
  import('./components/modules/RecordsModule.js').then((m) => ({
    default: m.RecordsModule,
  })),
);
const WhatsAppWorkspace = lazy(() =>
  import('./components/modules/CommunicationModules.js').then((m) => ({
    default: m.WhatsAppWorkspace,
  })),
);
const AssistantWorkspace = lazy(() =>
  import('./components/modules/CommunicationModules.js').then((m) => ({
    default: m.AssistantWorkspace,
  })),
);
const MarketingWorkspace = lazy(() =>
  import('./components/modules/MarketingWorkspace.js').then((m) => ({
    default: m.MarketingWorkspace,
  })),
);
const AuditWorkspace = lazy(() =>
  import('./components/modules/AuditWorkspace.js').then((m) => ({
    default: m.AuditWorkspace,
  })),
);
const OperationsDashboard = lazy(() =>
  import('./components/modules/OperationsDashboard.js').then((m) => ({
    default: m.OperationsDashboard,
  })),
);
const SiteWorkspace = lazy(() =>
  import('./components/modules/SiteWorkspace.js').then((m) => ({
    default: m.SiteWorkspace,
  })),
);
const AgendaWorkspace = lazy(() =>
  import('./components/modules/AgendaWorkspace.js').then((m) => ({
    default: m.AgendaWorkspace,
  })),
);

const stages = [
  { id: 'novo', name: 'Novas oportunidades' },
  { id: 'qualificado_ia', name: 'Qualificados' },
  { id: 'orcamento', name: 'Em proposta' },
  { id: 'contrato_ativo', name: 'Contrato ativo' },
] as const;

export function App() {
  const [user, setUser] = useState<AuthenticatedSession | null>(null);
  const [page, setPage] = useState<WorkspacePage>('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [foundryOpen, setFoundryOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [leadQuery, setLeadQuery] = useState('');
  const [archivedLeads, setArchivedLeads] = useState<WorkspaceLead[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const workspace = useWorkspace(user);
  const selectedLead = workspace.leads.find((lead) => lead.id === selectedId);
  const editingLead = workspace.leads.find((lead) => lead.id === editingId);
  const filteredLeads = (showArchived ? archivedLeads : workspace.leads).filter((lead) =>
    `${lead.name} ${lead.company} ${lead.phone}`
      .toLocaleLowerCase('pt-BR')
      .includes(leadQuery.toLocaleLowerCase('pt-BR')),
  );
  useDialogFocus(commandOpen || mobileOpen || createOpen || Boolean(selectedLead));
  useEffect(() => {
    if (user && !canNavigate(user, page)) {
      const first = allNavigation.find((item) => canNavigate(user, item.id));
      if (first) setPage(first.id);
    }
  }, [user, page]);
  useEffect(() => {
    document.getElementById('workspace-main')?.scrollTo({ top: 0 });
  }, [page]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setMobileOpen(false);
        setAccountOpen(false);
        setSelectedId(null);
        if (!busy) setCreateOpen(false);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [busy]);
  if (!user) return <LoginPage onAuthenticated={setUser} />;
  const navigate = (next: WorkspacePage) => {
    if (next === page || !canNavigate(user, next)) return;
    if (window.dispatchEvent(new Event('crm:navigate', { cancelable: true }))) setPage(next);
  };
  const showSearch = () => {
    setQuery('');
    setCommandOpen(true);
  };
  const openLead = (lead: WorkspaceLead) => {
    setSelectedId(lead.id);
    setActionError(null);
  };
  const advance = async (lead: WorkspaceLead) => {
    setBusy(true);
    setActionError(null);
    try {
      await workspace.advance(lead);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setBusy(false);
    }
  };
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError(null);
    const form = new FormData(event.currentTarget);
    const parsed = CreateWorkspaceLeadSchema.safeParse({
      name: form.get('name'),
      company: form.get('company'),
      phone: form.get('phone'),
      scopeSummary: form.get('scopeSummary'),
      monthlyValue: Number(form.get('monthlyValue') || 0),
      modality: form.get('modality'),
      notes: form.get('notes'),
      campaign: String(form.get('campaign') ?? ''),
      highPriority: form.get('highPriority') === 'on',
    });
    if (!parsed.success) {
      setActionError('Confira nome, empresa e telefone antes de salvar.');
      return;
    }
    setBusy(true);
    try {
      if (editingId) await workspace.update(editingId, parsed.data);
      else await workspace.create(parsed.data);
      setCreateOpen(false);
      setEditingId(null);
      setPage('kanban');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <WorkspaceShell
      page={page}
      user={user}
      collapsed={collapsed}
      mobileOpen={mobileOpen}
      accountOpen={accountOpen}
      onCollapse={() => setCollapsed((value) => !value)}
      onMobile={setMobileOpen}
      onAccount={() => setAccountOpen((value) => !value)}
      onSearch={showSearch}
      onLogout={() => {
        if (!window.dispatchEvent(new Event('crm:navigate', { cancelable: true }))) return;
        setUser(null);
        setSelectedId(null);
        setFoundryOpen(false);
        setAccountOpen(false);
      }}
      onNavigate={navigate}
    >
      <main className="crm-main" id="workspace-main">
        <div>
          <AnimatePresence mode="wait">
            <motion.div
              className="crm-page"
              data-page={page}
              key={page}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <ModuleIntro page={page} />
              {workspace.error && (
                <div className="workspace-notice" role="status">
                  {workspace.error}
                </div>
              )}
              <Suspense fallback={<p role="status">Abrindo ferramentas do workspace...</p>}>
                {page === 'dashboard' && (
                  <>
                    <OperationsDashboard
                      user={user}
                      leads={workspace.leads}
                      onOpenLead={openLead}
                      onNavigate={navigate}
                    />
                  </>
                )}
                {page === 'kanban' && (
                  <div className="kanban-page">
                    <div className="kanban-toolbar">
                      <div>
                        <Badge tone="sky">{workspace.leads.length} oportunidades</Badge>
                        <span>Um próximo passo por vez.</span>
                      </div>
                      <Button
                        onClick={() => {
                          setActionError(null);
                          setEditingId(null);
                          setCreateOpen(true);
                        }}
                      >
                        <Plus size={16} />
                        Novo contato
                      </Button>
                    </div>
                    <div className="module-toolbar">
                      <label className="module-search">
                        <Search size={16} />
                        <input
                          aria-label="Buscar contatos"
                          value={leadQuery}
                          onChange={(e) => setLeadQuery(e.target.value)}
                          placeholder="Buscar pessoa, empresa ou telefone..."
                        />
                      </label>
                      <button
                        className="module-filter"
                        type="button"
                        aria-pressed={showArchived}
                        onClick={() => {
                          if (showArchived) setShowArchived(false);
                          else
                            void workspace
                              .archived()
                              .then((items) => {
                                setArchivedLeads(items);
                                setShowArchived(true);
                              })
                              .catch((e) => setActionError(e.message));
                        }}
                      >
                        {showArchived ? 'Ver ativos' : 'Ver contatos arquivados'}
                      </button>
                      {(user.preview || resolveGrantedScope(user.roles, 'lead:export')) && (
                        <button
                          type="button"
                          className="module-filter"
                          disabled={!filteredLeads.length}
                          onClick={() =>
                            downloadCsv(
                              'oportunidades.csv',
                              filteredLeads as unknown as Record<string, unknown>[],
                            )
                          }
                        >
                          <Download size={16} />
                          Exportar contatos
                        </button>
                      )}
                    </div>
                    {actionError && (
                      <p className="workspace-notice" role="alert">
                        {actionError}
                      </p>
                    )}
                    <div className="kanban-board">
                      {stages.map((stage) => (
                        <section className="kanban-column" key={stage.id}>
                          <header>
                            <strong>{stage.name}</strong>
                            <Badge tone={stage.id === 'contrato_ativo' ? 'teal' : 'sky'}>
                              {filteredLeads.filter((lead) => lead.stage === stage.id).length}
                            </Badge>
                          </header>
                          {filteredLeads
                            .filter((lead) => lead.stage === stage.id)
                            .map((lead, index) => (
                              <Card key={lead.id} className="lead-card">
                                <div className="lead-card-person">
                                  <ContactAvatar
                                    name={lead.name}
                                    photoUrl={lead.avatarUrl}
                                    index={index}
                                  />
                                  <span>
                                    <h3>{lead.company}</h3>
                                    <small>{lead.name}</small>
                                  </span>
                                </div>
                                {lead.highPriority && <Badge tone="warm">Prioridade</Badge>}
                                {lead.scopeSummary && <p>{lead.scopeSummary}</p>}
                                <div className="lead-card-footer">
                                  <strong>
                                    {lead.monthlyValue.toLocaleString('pt-BR', {
                                      style: 'currency',
                                      currency: 'BRL',
                                    })}
                                  </strong>
                                  <div>
                                    {showArchived ? (
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          void workspace
                                            .restore(lead.id)
                                            .then(() => workspace.archived())
                                            .then(setArchivedLeads)
                                            .catch((e) => setActionError(e.message));
                                        }}
                                      >
                                        Restaurar contato
                                      </Button>
                                    ) : (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => openLead(lead)}
                                        >
                                          <Eye size={14} />
                                          Ficha
                                        </Button>
                                        {stage.id !== 'contrato_ativo' && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={busy}
                                            onClick={() => void advance(lead)}
                                          >
                                            Avançar
                                            <ArrowRight size={14} />
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </Card>
                            ))}
                          {!filteredLeads.some((lead) => lead.stage === stage.id) && (
                            <div className="empty-stage">
                              <Plus size={22} strokeWidth={1.2} />
                              <p>As próximas oportunidades desta etapa aparecem aqui.</p>
                            </div>
                          )}
                        </section>
                      ))}
                    </div>
                  </div>
                )}
                {page === 'blog' && <BlogStudio user={user} />}
                {page === 'contracts' && (
                  <RecordsModule kind="contract" user={user} leads={workspace.leads} />
                )}
                {page === 'finance' && (
                  <RecordsModule kind="invoice" user={user} leads={workspace.leads} />
                )}
                {page === 'whatsapp' && <WhatsAppWorkspace user={user} leads={workspace.leads} />}
                {page === 'ai_console' && <AssistantWorkspace user={user} />}
                {page === 'marketing' && <MarketingWorkspace user={user} />}
                {page === 'audit' && <AuditWorkspace user={user} />}
                {page === 'reports' && (
                  <OperationsDashboard user={user} onNavigate={navigate} full />
                )}
                {page === 'site' && <SiteWorkspace user={user} onNavigate={navigate} />}
                {page === 'projects' && (
                  <RecordsModule kind="project" user={user} leads={workspace.leads} />
                )}
                {page === 'agenda' && <AgendaWorkspace user={user} leads={workspace.leads} />}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <FloatingFoundry
        session={user}
        open={foundryOpen}
        onOpenChange={setFoundryOpen}
        leads={workspace.leads}
        onNavigate={navigate}
        onOpenLead={openLead}
      />
      <AnimatePresence>
        {(commandOpen || createOpen || selectedLead) && (
          <motion.div
            className="workspace-dialog-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (!busy) {
                setCommandOpen(false);
                setCreateOpen(false);
                setSelectedId(null);
              }
            }}
          >
            <motion.section
              className={`workspace-dialog ${selectedLead ? 'workspace-lead-dialog' : ''}`}
              role="dialog"
              aria-modal="true"
              aria-label={
                commandOpen
                  ? 'Buscar no CRM'
                  : selectedLead
                    ? `Ficha de ${selectedLead.name}`
                    : 'Novo contato'
              }
              data-crm-dialog
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="panel-heading">
                <h2>
                  {commandOpen
                    ? 'Encontre seu próximo passo.'
                    : selectedLead
                      ? 'Ficha do contato'
                      : 'Uma nova oportunidade.'}
                </h2>
                <button
                  className="icon-button"
                  type="button"
                  disabled={busy}
                  aria-label="Fechar diálogo"
                  onClick={() => {
                    setCommandOpen(false);
                    setCreateOpen(false);
                    setSelectedId(null);
                  }}
                >
                  <X size={19} />
                </button>
              </header>
              {commandOpen && (
                <>
                  <div className="workspace-search">
                    <Search size={18} />
                    <input
                      autoFocus
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      aria-label="Buscar área do CRM"
                      placeholder="Buscar uma área..."
                    />
                  </div>
                  <div className="command-results">
                    {allNavigation
                      .filter(
                        (item) =>
                          canNavigate(user, item.id) &&
                          item.label
                            .toLocaleLowerCase('pt-BR')
                            .includes(query.toLocaleLowerCase('pt-BR')),
                      )
                      .map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => {
                            navigate(item.id);
                            setCommandOpen(false);
                          }}
                        >
                          <item.icon size={18} />
                          {item.label}
                          <ArrowRight size={15} />
                        </button>
                      ))}
                    {!allNavigation.some(
                      (item) =>
                        canNavigate(user, item.id) &&
                        item.label
                          .toLocaleLowerCase('pt-BR')
                          .includes(query.toLocaleLowerCase('pt-BR')),
                    ) && <p>Nenhuma área encontrada.</p>}
                  </div>
                </>
              )}
              {selectedLead && (
                <>
                  <div className="lead-profile">
                    <ContactAvatar name={selectedLead.name} photoUrl={selectedLead.avatarUrl} />
                    <div>
                      <h3>{selectedLead.company}</h3>
                      <p>{selectedLead.name}</p>
                    </div>
                  </div>
                  <dl className="lead-details">
                    <div>
                      <dt>Telefone</dt>
                      <dd>{selectedLead.phone}</dd>
                    </div>
                    <div>
                      <dt>Escopo</dt>
                      <dd>{selectedLead.scopeSummary || 'Ainda não definido.'}</dd>
                    </div>
                    <div>
                      <dt>Modelo</dt>
                      <dd>{selectedLead.modality}</dd>
                    </div>
                    <div>
                      <dt>Valor no funil</dt>
                      <dd>
                        {selectedLead.monthlyValue.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt>Notas</dt>
                      <dd>{selectedLead.notes || 'Sem notas por enquanto.'}</dd>
                    </div>
                  </dl>
                  <p className="profile-photo-note">
                    A foto aparece quando estiver disponível pela sua sessão Baileys.
                  </p>
                  {actionError && (
                    <p className="login-error" role="alert">
                      {actionError}
                    </p>
                  )}
                  <div className="record-actions">
                    <Button
                      onClick={() => {
                        setEditingId(selectedLead.id);
                        setSelectedId(null);
                        setCreateOpen(true);
                      }}
                    >
                      <Edit3 size={15} />
                      Editar contato
                    </Button>
                    <a
                      className="module-primary-link"
                      href={`https://wa.me/${selectedLead.phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageSquare size={15} />
                      WhatsApp
                    </a>
                    <button
                      className="text-button"
                      disabled={busy || user.preview}
                      onClick={() => {
                        setBusy(true);
                        void workspace
                          .archive(selectedLead.id)
                          .then(() => setSelectedId(null))
                          .catch((e) => setActionError(e.message))
                          .finally(() => setBusy(false));
                      }}
                    >
                      <Archive size={15} />
                      Arquivar contato
                    </button>
                  </div>
                </>
              )}
              {createOpen && (
                <form
                  key={editingId ?? 'new'}
                  className="contact-form"
                  onSubmit={(event) => void create(event)}
                >
                  {user.preview && (
                    <p className="workspace-notice">
                      Prévia visual. Configure o banco e o administrador no VPS para salvar contatos
                      reais.
                    </p>
                  )}
                  <label>
                    Nome do contato
                    <input
                      name="name"
                      defaultValue={editingLead?.name}
                      required
                      minLength={2}
                      maxLength={180}
                      autoComplete="name"
                    />
                  </label>
                  <label>
                    Empresa
                    <input
                      name="company"
                      defaultValue={editingLead?.company}
                      required
                      minLength={2}
                      maxLength={180}
                    />
                  </label>
                  <label>
                    WhatsApp
                    <input
                      name="phone"
                      defaultValue={editingLead?.phone}
                      type="tel"
                      required
                      autoComplete="tel"
                      placeholder="+55 41 99999-9999"
                    />
                  </label>
                  <label>
                    O que vamos construir?
                    <textarea
                      name="scopeSummary"
                      defaultValue={editingLead?.scopeSummary}
                      rows={3}
                      maxLength={2000}
                    />
                  </label>
                  <div className="contact-form-row">
                    <label>
                      Modelo
                      <select name="modality" defaultValue={editingLead?.modality}>
                        <option>Projeto Fechado</option>
                        <option>Retainer Mensal</option>
                      </select>
                    </label>
                    <label>
                      Valor previsto (R$)
                      <input
                        name="monthlyValue"
                        defaultValue={editingLead?.monthlyValue}
                        type="number"
                        min="0"
                        step="0.01"
                      />
                    </label>
                  </div>
                  <label>
                    Origem / campanha
                    <input
                      name="campaign"
                      defaultValue={editingLead?.campaign}
                      maxLength={150}
                      placeholder="Google Ads, indicação, blog, campanha..."
                    />
                  </label>
                  <label>
                    Notas
                    <textarea
                      name="notes"
                      defaultValue={editingLead?.notes}
                      rows={2}
                      maxLength={4000}
                    />
                  </label>
                  <label className="contact-priority">
                    <input
                      type="checkbox"
                      name="highPriority"
                      defaultChecked={editingLead?.highPriority}
                    />
                    Marcar como prioridade
                  </label>
                  {actionError && (
                    <p role="alert" className="login-error">
                      {actionError}
                    </p>
                  )}
                  <Button type="submit" disabled={busy || user.preview}>
                    {busy ? 'Salvando...' : 'Salvar contato'}
                  </Button>
                </form>
              )}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </WorkspaceShell>
  );
}
