import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, MoreVertical, PanelRight, Phone, RefreshCw, Sparkles } from 'lucide-react';
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
  const [menu, setMenu] = useState(false);
  const pop = useRef<HTMLDivElement>(null);
  const name = row.name || 'Contato';
  const phone = row.phone || '';
  const sla = row.status === 'open' ? waitLabel(row.pending_since, row.sla_goal_minutes ?? 30, now) : null;
  const foundryLabel = foundryBusy ? 'Salvando…' : foundry?.paused ? 'Foundry pausada' : 'Foundry respondendo';
  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!pop.current?.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [menu]);
  const actions = (
    <>
      <a className="wa-pill" href={`https://wa.me/${phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={15} /> Abrir no WhatsApp
      </a>
      {phone && (
        <a className="wa-pill" href={`tel:${phone}`}>
          <Phone size={15} /> Ligar
        </a>
      )}
      {canSync && (
        <button type="button" className="wa-pill" onClick={onSync}>
          <RefreshCw size={15} /> Sincronizar histórico
        </button>
      )}
      <button type="button" className="wa-pill" onClick={onStatus}>
        {row.status === 'closed' ? 'Reabrir' : 'Encerrar'}
      </button>
      <button type="button" className="wa-pill" onClick={onToggleFoundry} disabled={foundryBusy || !foundry} aria-pressed={foundry ? !foundry.paused : undefined}>
        <Sparkles size={15} /> {foundryLabel}
      </button>
      <button type="button" className="wa-pill" onClick={onPanel}>
        <PanelRight size={15} /> Ficha
      </button>
    </>
  );
  return (
    <header className="wa-convo-head">
      <div className="wa-convo-id">
        <button type="button" className="wa-back" onClick={onBack} aria-label="Voltar para conversas">
          <ArrowLeft size={18} />
        </button>
        <ContactAvatar name={name} photoUrl={row.photoUrl} />
        <div>
          <h3>{name}</h3>
          <small>
            {maskPhone(phone)}
            {row.company ? ` · ${row.company}` : ''}
            {row.scope_summary ? ` · ${row.scope_summary}` : ''}
          </small>
        </div>
        <button type="button" className="wa-more" aria-label="Mais ações" aria-expanded={menu} onClick={() => setMenu((value) => !value)}>
          <MoreVertical size={18} />
        </button>
        <div className="wa-head-actions">{actions}</div>
        {menu && (
          <div className="wa-head-menu" ref={pop} role="menu">
            {actions}
          </div>
        )}
      </div>
      <div className="wa-convo-meta">
        <span>{row.created_at ? `Entrada do lead: ${fullDateTime(row.created_at)}` : 'Entrada do lead indisponível'}</span>
        {sla && <i className={`is-${sla.tone}`}>{sla.label}</i>}
        {foundryError && <strong role="alert">{foundryError}</strong>}
      </div>
    </header>
  );
}
