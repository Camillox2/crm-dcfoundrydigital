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
}: {
  open: boolean;
  onOpenChange: (open: boolean | ((current: boolean) => boolean)) => void;
  leads: WorkspaceLead[];
  onNavigate: (page: WorkspacePage) => void;
  onOpenLead: (lead: WorkspaceLead) => void;
}) {
  const [tipVisible, setTipVisible] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const { prefersReducedMotion } = useTheme();
  const insights = getDailyInsights(leads);
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
