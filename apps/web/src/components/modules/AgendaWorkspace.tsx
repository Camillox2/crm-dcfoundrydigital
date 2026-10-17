import { useState } from 'react';
import { CalendarDays, Check, ArrowLeft, ArrowRight } from 'lucide-react';
import { Card } from '@dcfoundry/ui';
import { businessDate, type WorkspaceLead, type WorkspaceDocument } from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useModule } from './useModule.js';
import { ModuleNotice } from './ModuleTools.js';
import { RecordsModule } from './RecordsModule.js';

export function AgendaWorkspace({
  user,
  leads,
}: {
  user: AuthenticatedSession;
  leads: WorkspaceLead[];
}) {
  const tasks = useModule('task', user),
    today = businessDate();
  const [month, setMonth] = useState(today.slice(0, 7)),
    [selected, setSelected] = useState(''),
    [filter, setFilter] = useState('open'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  const first = new Date(month + '-01T12:00:00Z'),
    last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = [
    ...Array.from({ length: (first.getUTCDay() + 6) % 7 }, () => ''),
    ...Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
  const changeMonth = (step: number) => {
    const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + step, 1, 12));
    setMonth(date.toISOString().slice(0, 7));
    setSelected('');
  };
  const visible = tasks.items
    .filter((t) => {
      const d = t.data as Record<string, unknown>;
      return (
        (!selected || d.dueDate === selected) &&
        (filter === 'all' || filter === 'overdue'
          ? filter === 'all' ||
            (d.status === 'open' && Boolean(d.dueDate) && String(d.dueDate) < today)
          : d.status === filter)
      );
    })
    .sort((a, b) =>
      String((a.data as any).dueDate || '9999').localeCompare(
        String((b.data as any).dueDate || '9999'),
      ),
    );
  const toggle = async (task: WorkspaceDocument) => {
    setBusy(task.id);
    setError('');
    try {
      await tasks.save(
        {
          ...task.data,
          status: (task.data as any).status === 'done' ? 'open' : 'done',
        },
        task,
        task.leadId,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="module-workspace">
      <div className="ops-chart-grid">
        <Card className="ops-calendar">
          <div className="panel-heading">
            <div>
              <h3>
                {first.toLocaleDateString('pt-BR', {
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </h3>
              <p>Tarefas com prazo cadastrado. Clique em um dia para filtrar.</p>
            </div>
            <div className="module-actions">
              <button
                className="icon-button"
                aria-label="Mês anterior"
                onClick={() => changeMonth(-1)}
              >
                <ArrowLeft size={16} />
              </button>
              <button
                className="module-filter"
                onClick={() => {
                  setMonth(today.slice(0, 7));
                  setSelected(today);
                }}
              >
                Hoje
              </button>
              <button
                className="icon-button"
                aria-label="Próximo mês"
                onClick={() => changeMonth(1)}
              >
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
          <div className="ops-calendar-grid">
            {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => (
              <span key={i} className="ops-weekday">
                {d}
              </span>
            ))}
            {cells.map((date, i) => {
              const amount = date
                ? tasks.items.filter(
                    (t) => (t.data as any).dueDate === date && (t.data as any).status === 'open',
                  ).length
                : 0;
              return date ? (
                <button
                  key={date}
                  aria-label={`${date}: ${amount} tarefas abertas`}
                  aria-pressed={selected === date}
                  data-today={date === today}
                  onClick={() => setSelected(selected === date ? '' : date)}
                >
                  <span>{Number(date.slice(-2))}</span>
                  {amount > 0 && <b>{amount}</b>}
                </button>
              ) : (
                <span key={`blank-${i}`} />
              );
            })}
          </div>
          <button className="text-button" onClick={() => setSelected('')}>
            Mostrar todas as datas
          </button>
          {tasks.total > 100 && (
            <p className="ops-footnote">
              Calendário dos 100 registros desta página. Use a lista abaixo para navegar nos demais.
            </p>
          )}
        </Card>
        <Card className="ops-data-card">
          <div className="panel-heading">
            <div>
              <h3>
                {selected
                  ? `Tarefas de ${new Date(selected + 'T12:00:00Z').toLocaleDateString('pt-BR')}`
                  : 'Próximas ações'}
              </h3>
              <p>Conclua, reabra ou consulte o cadastro completo abaixo.</p>
            </div>
            <CalendarDays size={20} />
          </div>
          <div className="module-tabs">
            {[
              ['open', 'Em aberto'],
              ['overdue', 'Atrasadas'],
              ['done', 'Concluídas'],
              ['all', 'Todas'],
            ].map(([v, label]) => (
              <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v ?? 'all')}>
                {label}
              </button>
            ))}
          </div>
          {error && <ModuleNotice error>{error}</ModuleNotice>}
          {visible.slice(0, 12).map((t) => {
            const d = t.data as any;
            return (
              <div className="ops-agenda-row" key={t.id}>
                <button
                  className="icon-button"
                  aria-label={`${d.status === 'done' ? 'Reabrir' : 'Concluir'} ${d.title}`}
                  onClick={() => toggle(t)}
                  disabled={busy === t.id || user.preview}
                >
                  <Check size={17} />
                </button>
                <span>
                  <strong>{d.title}</strong>
                  <small>
                    {d.dueDate || 'Sem data'} ·{' '}
                    {d.priority === 'high' ? 'Prioridade alta' : 'Prioridade normal'} ·{' '}
                    {d.status === 'done' ? 'Concluída' : 'Em aberto'}
                  </small>
                </span>
              </div>
            );
          })}
          {!visible.length && <p className="ops-empty-copy">Nenhuma tarefa neste filtro.</p>}
        </Card>
      </div>
      <RecordsModule kind="task" user={user} leads={leads} />
    </div>
  );
}
