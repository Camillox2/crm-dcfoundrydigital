import { sessionFetch } from '../session.js';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, BellOff, ChevronDown, Sparkles, X } from 'lucide-react';
import { FoundryMascot, useTheme } from '@dcfoundry/ui';
import { getDailyInsights, type WorkspaceLead, type WorkspacePage } from '@dcfoundry/shared';
import { useDialogFocus } from './useDialogFocus.js';

export function FloatingFoundry({
  leads,
  open,
  onOpenChange: setOpen,
  onNavigate,
  onOpenLead,
  session,
}: {
  open: boolean;
  onOpenChange: (open: boolean | ((current: boolean) => boolean)) => void;
  leads: WorkspaceLead[];
  onNavigate: (page: WorkspacePage) => void;
  onOpenLead: (lead: WorkspaceLead) => void;
  session?: { accessToken?: string; preview?: boolean };
}) {
  const [tipVisible, setTipVisible] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const { prefersReducedMotion } = useTheme();
  const [summary, setSummary] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!session?.accessToken || session.preview) return;
    const c = new AbortController();
    sessionFetch('/api/v1/workspace/daily-summary', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      signal: c.signal,
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        if (!c.signal.aborted) setSummary(data);
      })
      .catch(() => {});
    return () => c.abort();
  }, [session?.accessToken, session?.preview, open]);
  const insights = getDailyInsights(leads).filter(
    (item) =>
      !(item.id === 'first-contact' && Object.values(summary).some((v) => v > 0)) &&
      !(item.id === 'ads-setup' && (summary.campaign ?? 0) > 0),
  );
  if (summary.taskPending)
    insights.unshift({
      id: 'daily-tasks',
      title: `${summary.taskPending} tarefas para acompanhar.`,
      detail: summary.taskOverdue
        ? `${summary.taskOverdue} estão com prazo vencido. Confira sua agenda.`
        : 'Sua agenda tem próximos passos em aberto.',
      action: 'Abrir agenda',
      page: 'agenda',
      tone: summary.taskOverdue ? 'priority' : 'info',
    });
  if (summary.invoicePending)
    insights.unshift({
      id: 'daily-invoices',
      title: `${summary.invoicePending} cobranças em aberto.`,
      detail: summary.invoiceOverdue
        ? `${summary.invoiceOverdue} passaram do vencimento.`
        : 'Confira os próximos vencimentos e recebimentos.',
      action: 'Ver financeiro',
      page: 'finance',
      tone: summary.invoiceOverdue ? 'priority' : 'info',
    });
  if (summary.project)
    insights.push({
      id: 'daily-projects',
      title: `${summary.project} projetos no workspace.`,
      detail: 'Confira andamento, stack e as próximas entregas.',
      action: 'Ver projetos',
      page: 'projects',
      tone: 'info',
    });
  if (summary.blogPending)
    insights.push({
      id: 'daily-blog',
      title: `${summary.blogPending} artigos em preparação.`,
      detail: 'Rascunhos e agendamentos para acompanhar no seu calendário editorial.',
      action: 'Abrir editoria',
      page: 'blog',
      tone: 'info',
    });
  useDialogFocus(open);
  useEffect(() => {
    let muted = false;
    try {
      muted = Number(sessionStorage.getItem('dcf-foundry-muted-until') ?? 0) > Date.now();
    } catch {
      /* storage can be disabled */
    }
    if (muted) return;
    const timer = window.setTimeout(() => setTipVisible(true), 9000);
    const hide = window.setTimeout(() => setTipVisible(false), 23000);
    return () => {
      clearTimeout(timer);
      clearTimeout(hide);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  const snooze = () => {
    setTipVisible(false);
    try {
      sessionStorage.setItem('dcf-foundry-muted-until', String(Date.now() + 3_600_000));
    } catch {
      /* optional preference */
    }
  };
  return (
    <div className="floating-foundry">
      <AnimatePresence>
        {tipVisible && !open && (
          <motion.div
            className="foundry-daily-tip"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <button
              className="tip-open"
              onClick={() => {
                setOpen(true);
                setTipVisible(false);
              }}
            >
              <strong>Seu dia com mais clareza.</strong>
              <span>{insights[0]?.title}</span>
            </button>
            <button
              className="icon-button"
              onClick={snooze}
              aria-label="Silenciar sugestões por uma hora"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <motion.section
            className="foundry-daily-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Foundry: seu dia no CRM"
            data-crm-dialog
            initial={{
              opacity: 0,
              y: prefersReducedMotion ? 0 : 14,
              scale: prefersReducedMotion ? 1 : 0.97,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <header>
              <div>
                <FoundryMascot size={44} paused={prefersReducedMotion} />
                <span>
                  <strong>Seu dia com o Foundry.</strong>
                  <small>
                    {new Intl.DateTimeFormat('pt-BR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    }).format(new Date())}
                  </small>
                </span>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Fechar Foundry"
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="foundry-insights">
              <p className="insight-source">
                <Sparkles size={14} />
                Prioridades a partir do seu workspace
              </p>
              {insights.map((insight) => (
                <article key={insight.id} data-tone={insight.tone}>
                  <strong>{insight.title}</strong>
                  <p>{insight.detail}</p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      const lead = leads.find((item) => item.id === insight.leadId);
                      setOpen(false);
                      onNavigate(insight.page);
                      if (lead) onOpenLead(lead);
                    }}
                  >
                    {insight.action}
                    <ArrowRight size={15} />
                  </button>
                </article>
              ))}
            </div>
            <footer>
              <span>Sem ações automáticas nos seus clientes.</span>
              <button
                type="button"
                onClick={() => {
                  snooze();
                  setOpen(false);
                }}
              >
                <BellOff size={13} />
                Lembrar depois
              </button>
            </footer>
          </motion.section>
        )}
      </AnimatePresence>
      <button
        ref={launcher}
        className="foundry-daily-launcher"
        type="button"
        aria-label={open ? 'Minimizar Foundry' : 'Abrir Foundry e prioridades do dia'}
        aria-expanded={open}
        onClick={() => {
          setTipVisible(false);
          setOpen((value) => !value);
        }}
      >
        {open ? (
          <ChevronDown size={24} />
        ) : (
          <FoundryMascot size={58} paused={prefersReducedMotion} />
        )}
        <span className="foundry-launcher-label">Foundry</span>
      </button>
    </div>
  );
}
