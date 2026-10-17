import { ArrowLeft, ExternalLink, PanelRight, Phone, RefreshCw, Sparkles } from 'lucide-react';
import { ContactAvatar } from '../ContactAvatar.js';
import { fullDateTime, maskPhone, waitLabel } from './chatTime.js';
import type { ConversationRow } from './types.js';

export function ConversationHeader({
  row,
  now,
  foundry,
  foundryBusy,
  foundryError,
  canSync,
  onBack,
  onToggleFoundry,
  onStatus,
  onSync,
  onPanel,
}: {
  row: ConversationRow;
  now: number;
  foundry: { paused: boolean } | null;
  foundryBusy: boolean;
  foundryError: string;
  canSync: boolean;
  onBack: () => void;
  onToggleFoundry: () => void;
  onStatus: () => void;
  onSync: () => void;
  onPanel: () => void;
}) {
  const name = row.name || 'Contato';
  const phone = row.phone || '';
  const sla =
    row.status === 'open' ? waitLabel(row.pending_since, row.sla_goal_minutes ?? 30, now) : null;
  const foundryFull = foundryBusy
    ? 'Salvando…'
    : foundry?.paused
      ? 'Foundry pausada'
      : 'Foundry respondendo';
  const foundryCompact = foundryBusy ? '…' : foundry?.paused ? 'Pausada' : 'Ativa';
  return (
    <header className="wa-convo-head">
      <div className="wa-convo-id">
        <button
          type="button"
          className="wa-back"
          onClick={onBack}
          aria-label="Voltar para a lista de conversas"
        >
          <ArrowLeft size={18} />
        </button>
        <ContactAvatar name={name} photoUrl={row.photoUrl} />
        <div className="wa-convo-who">
          <h3>
            <span>{name}</span>
            {phone && (
              <a className="wa-call" href={`tel:${phone}`} title={`Ligar para ${maskPhone(phone)}`}>
                <Phone size={12} />
                <span>Ligar</span>
              </a>
            )}
          </h3>
          <small>
            {maskPhone(phone)}
            {row.company ? ` · ${row.company}` : ''}
            {row.scope_summary ? ` · ${row.scope_summary}` : ''}
          </small>
        </div>
      </div>
      <div className="wa-head-actions">
        <a
          className="wa-pill wa-pill-extra"
          href={`https://wa.me/${phone.replace(/\D/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={15} /> Abrir no WhatsApp
        </a>
        {canSync && (
          <button type="button" className="wa-pill wa-pill-extra" onClick={onSync}>
            <RefreshCw size={15} /> Sincronizar histórico
          </button>
        )}
        <button type="button" className="wa-pill" onClick={onStatus}>
          {row.status === 'closed' ? 'Reabrir' : 'Encerrar'}
        </button>
        <button
          type="button"
          className="wa-pill"
          onClick={onToggleFoundry}
          disabled={foundryBusy || !foundry}
          aria-pressed={foundry ? !foundry.paused : undefined}
        >
          <Sparkles size={13} />
          <span className="wa-label-full">{foundryFull}</span>
          <span className="wa-label-compact">{foundryCompact}</span>
        </button>
        <button type="button" className="wa-pill" onClick={onPanel}>
          <PanelRight size={13} /> Ficha
        </button>
      </div>
      <div className="wa-convo-meta">
        <span>
          {row.created_at
            ? `Entrada do lead: ${fullDateTime(row.created_at)}`
            : 'Entrada do lead indisponível'}
        </span>
        {sla && <i className={`is-${sla.tone}`}>{sla.label}</i>}
        {foundryError && <strong role="alert">{foundryError}</strong>}
      </div>
    </header>
  );
}
