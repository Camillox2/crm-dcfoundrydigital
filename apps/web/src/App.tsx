import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Eye, Plus, Search, X } from 'lucide-react';
import { Badge, Button, Card } from '@dcfoundry/ui';
import {
  CreateWorkspaceLeadSchema,
  type WorkspaceLead,
  type WorkspacePage,
} from '@dcfoundry/shared';
import { LoginPage, type AuthenticatedSession } from './pages/LoginPage.js';
import { WorkspaceShell, allNavigation } from './components/WorkspaceShell.js';
import { Overview } from './components/Overview.js';
import { ModuleIntro } from './components/ModuleIntro.js';
import { EmptyModule } from './components/EmptyModule.js';
import { FloatingFoundry } from './components/FloatingFoundry.js';
import { ContactAvatar } from './components/ContactAvatar.js';
import { useWorkspace } from './components/useWorkspace.js';
import { useDialogFocus } from './components/useDialogFocus.js';
import '@dcfoundry/ui/tokens.css';
import './workspace.css';

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
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const workspace = useWorkspace(user);
  const selectedLead = workspace.leads.find((lead) => lead.id === selectedId);
  useDialogFocus(commandOpen || mobileOpen || createOpen || Boolean(selectedLead));
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
      highPriority: form.get('highPriority') === 'on',
    });
    if (!parsed.success) {
      setActionError('Confira nome, empresa e telefone antes de salvar.');
      return;
    }
    setBusy(true);
    try {
      await workspace.create(parsed.data);
      setCreateOpen(false);
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
        setUser(null);
        setSelectedId(null);
        setFoundryOpen(false);
        setAccountOpen(false);
      }}
      onNavigate={setPage}
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
              {page === 'dashboard' && (
                <Overview
                  leads={workspace.leads}
                  loading={workspace.loading}
                  onOpenLead={openLead}
                  onNavigate={setPage}
                />
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
                        setCreateOpen(true);
                      }}
                    >
                      <Plus size={16} />
                      Novo contato
                    </Button>
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
                            {workspace.leads.filter((lead) => lead.stage === stage.id).length}
                          </Badge>
                        </header>
                        {workspace.leads
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
                                  <Button size="sm" variant="ghost" onClick={() => openLead(lead)}>
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
                                </div>
                              </div>
                            </Card>
                          ))}
                        {!workspace.leads.some((lead) => lead.stage === stage.id) && (
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
              {!['dashboard', 'kanban'].includes(page) && (
                <EmptyModule
                  page={page}
                  onNavigate={setPage}
                  onOpenFoundry={() => setFoundryOpen(true)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <FloatingFoundry
        open={foundryOpen}
        onOpenChange={setFoundryOpen}
        leads={workspace.leads}
        onNavigate={setPage}
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
                      .filter((item) =>
                        item.label
                          .toLocaleLowerCase('pt-BR')
                          .includes(query.toLocaleLowerCase('pt-BR')),
                      )
                      .map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => {
                            setPage(item.id);
                            setCommandOpen(false);
                          }}
                        >
                          <item.icon size={18} />
                          {item.label}
                          <ArrowRight size={15} />
                        </button>
                      ))}
                    {!allNavigation.some((item) =>
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
                </>
              )}
              {createOpen && (
                <form className="contact-form" onSubmit={(event) => void create(event)}>
                  {user.preview && (
                    <p className="workspace-notice">
                      Prévia visual. Configure o banco e o administrador no VPS para salvar contatos
                      reais.
                    </p>
                  )}
                  <label>
                    Nome do contato
                    <input name="name" required minLength={2} maxLength={180} autoComplete="name" />
                  </label>
                  <label>
                    Empresa
                    <input name="company" required minLength={2} maxLength={180} />
                  </label>
                  <label>
                    WhatsApp
                    <input
                      name="phone"
                      type="tel"
                      required
                      autoComplete="tel"
                      placeholder="+55 41 99999-9999"
                    />
                  </label>
                  <label>
                    O que vamos construir?
                    <textarea name="scopeSummary" rows={3} maxLength={2000} />
                  </label>
                  <div className="contact-form-row">
                    <label>
                      Modelo
                      <select name="modality">
                        <option>Projeto Fechado</option>
                        <option>Retainer Mensal</option>
                      </select>
                    </label>
                    <label>
                      Valor previsto (R$)
                      <input name="monthlyValue" type="number" min="0" step="0.01" />
                    </label>
                  </div>
                  <label>
                    Notas
                    <textarea name="notes" rows={2} maxLength={4000} />
                  </label>
                  <label className="contact-priority">
                    <input type="checkbox" name="highPriority" />
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
