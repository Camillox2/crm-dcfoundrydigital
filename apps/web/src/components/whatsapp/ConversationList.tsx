import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, MessageSquarePlus, PenLine, Search, StickyNote } from 'lucide-react';
import { isSameDay } from './chatTime.js';
import { ConversationItem } from './ConversationItem.js';
import type { ConversationRow } from './types.js';

export function ConversationList({
  rows,
  selected,
  query,
  status,
  day,
  collapsed,
  sessionLabel,
  now,
  onQuery,
  onStatus,
  onDay,
  onToggle,
  onSelect,
  onCreate,
  onTemplates,
  onPrepare,
}: {
  rows: ConversationRow[];
  selected: string;
  query: string;
  status: 'open' | 'closed';
  day: 'today' | 'yesterday' | 'all';
  collapsed: boolean;
  sessionLabel: string;
  now: number;
  onQuery: (value: string) => void;
  onStatus: (value: 'open' | 'closed') => void;
  onDay: (value: 'today' | 'yesterday' | 'all') => void;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onTemplates: () => void;
  onPrepare: () => void;
}) {
  const searching = query.trim().length > 0;
  const digits = query.replace(/\D/g, '');
  const matches = (row: ConversationRow) => {
    const phone = (row.phone || '').replace(/\D/g, '');
    const text = `${row.name ?? ''} ${row.company ?? ''} ${row.last_message ?? ''} ${row.source ?? ''}`.toLocaleLowerCase('pt-BR');
    const words = query.toLocaleLowerCase('pt-BR');
    return text.includes(words) || (digits.length >= 3 && phone.includes(digits));
  };
  const inDay = (row: ConversationRow) => {
    if (day === 'all') return true;
    return Boolean(row.created_at && isSameDay(row.created_at, day, new Date(now)));
  };
  const pool = rows.filter((row) => inDay(row) && (!searching || matches(row)));
  const openCount = pool.filter((row) => (row.status ?? 'open') !== 'closed').length;
  const closedCount = pool.filter((row) => row.status === 'closed').length;
  const dayCounts = {
    today: rows.filter((row) => row.created_at && isSameDay(row.created_at, 'today', new Date(now)) && (searching ? matches(row) : (status === 'closed' ? row.status === 'closed' : row.status !== 'closed'))).length,
    yesterday: rows.filter((row) => row.created_at && isSameDay(row.created_at, 'yesterday', new Date(now)) && (searching ? matches(row) : (status === 'closed' ? row.status === 'closed' : row.status !== 'closed'))).length,
    all: rows.filter((row) => (searching ? matches(row) : status === 'closed' ? row.status === 'closed' : row.status !== 'closed')).length,
  };
  const visible = pool.filter((row) => (searching ? true : status === 'closed' ? row.status === 'closed' : row.status !== 'closed'));
  const [windowStart, setWindowStart] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const itemHeight = 92;
  useEffect(() => setWindowStart(0), [query, status, day]);
  const sliced = useMemo(() => {
    if (visible.length <= 100) return visible.map((row, index) => ({ row, index }));
    const count = 16;
    return visible.slice(windowStart, windowStart + count).map((row, offset) => ({ row, index: windowStart + offset }));
  }, [visible, windowStart]);
  const onKey = (event: KeyboardEvent) => {
    const index = visible.findIndex((row) => row.id === selected);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = visible[Math.min(visible.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))];
      if (next) onSelect(next.id);
    }
    const current = index >= 0 ? visible[index] : undefined;
    if (event.key === 'Enter' && current) onSelect(current.id);
  };
  return (
    <aside className="wa-list" id="wa-conversation-list" aria-label="Conversas">
      <header>
        {!collapsed && (
          <div>
            <h2>Conversas</h2>
            <p>{sessionLabel}</p>
          </div>
        )}
        <button type="button" aria-expanded={!collapsed} aria-controls="wa-conversation-items" onClick={onToggle} aria-label={collapsed ? 'Expandir conversas' : 'Recolher conversas'}>
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </header>
      {!collapsed && (
        <>
          <div className="wa-list-tools">
            <button type="button" onClick={onCreate}>
              <MessageSquarePlus size={16} /> Novo contato
            </button>
            <button type="button" aria-label="Respostas prontas" title="Respostas prontas" onClick={onTemplates}>
              <StickyNote size={16} />
            </button>
            <button type="button" aria-label="Preparar mensagem" title="Preparar mensagem" onClick={onPrepare}>
              <PenLine size={16} />
            </button>
          </div>
          <label className="wa-search">
            <Search size={16} />
            <input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Nome, empresa, telefone ou mensagem" aria-label="Buscar conversas" />
          </label>
          <div className="wa-day-filters" role="group" aria-label="Entrada do lead">
            {([
              ['today', 'Hoje'],
              ['yesterday', 'Ontem'],
              ['all', 'Todos'],
            ] as const).map(([id, label]) => (
              <button type="button" key={id} aria-pressed={day === id} onClick={() => onDay(id)}>
                {label}
                <b>{dayCounts[id]}</b>
              </button>
            ))}
          </div>
          <div className="wa-status-tabs" data-status={status} role="tablist">
            <span className="wa-tab-thumb" />
            <button type="button" role="tab" aria-selected={status === 'open'} onClick={() => onStatus('open')}>
              Abertas <b>{openCount}</b>
            </button>
            <button type="button" role="tab" aria-selected={status === 'closed'} onClick={() => onStatus('closed')}>
              Encerradas <b>{closedCount}</b>
            </button>
          </div>
          <div
            id="wa-conversation-items"
            className="wa-list-scroll"
            ref={list}
            role="listbox"
            aria-label="Lista de conversas"
            tabIndex={0}
            onKeyDown={onKey}
            onScroll={(event) => {
              if (visible.length <= 100) return;
              setWindowStart(Math.max(0, Math.floor(event.currentTarget.scrollTop / itemHeight)));
            }}
          >
            {visible.length > 100 && <div style={{ height: windowStart * itemHeight }} />}
            {sliced.map(({ row }) => (
              <ConversationItem key={row.id} row={row} selected={row.id === selected} now={now} onSelect={() => onSelect(row.id)} />
            ))}
            {visible.length > 100 && <div style={{ height: Math.max(0, (visible.length - windowStart - sliced.length) * itemHeight) }} />}
            {!visible.length && (
              <p className="wa-empty">
                {searching ? 'Nenhuma conversa encontrada para esta busca.' : status === 'closed' ? 'Nenhuma conversa encerrada.' : 'Nenhuma conversa aberta.'}
              </p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
