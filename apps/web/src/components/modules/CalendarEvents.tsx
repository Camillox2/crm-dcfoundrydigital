import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Card } from '@dcfoundry/ui';
import { CalendarDays, Clock, Video } from 'lucide-react';
import { businessDate, resolveGrantedScope, type WorkspaceLead } from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi } from './useModule.js';
const names: Record<string, string> = {
  meeting: 'Reunião',
  followup: 'Follow-up',
  event: 'Compromisso',
  scheduled: 'Agendado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};
const localValue = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export function CalendarEvents({
  user,
  leads,
}: {
  user: AuthenticatedSession;
  leads: WorkspaceLead[];
}) {
  const request = useCrmApi(user),
    [date, setDate] = useState(businessDate()),
    [items, setItems] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [settings, setSettings] = useState<any>();
  const canEdit = Boolean(resolveGrantedScope(user.roles, 'task:update'));
  const load = useCallback(async () => {
    if (user.preview) return;
    try {
      const from = new Date(date + 'T00:00:00-03:00'),
        to = new Date(from.getTime() + 7 * 86400000),
        [events, config] = await Promise.all([
          request(
            '/api/v1/calendar?from=' +
              encodeURIComponent(from.toISOString()) +
              '&to=' +
              encodeURIComponent(to.toISOString()),
          ),
          request('/api/v1/calendar/settings'),
        ]);
      setItems(events.items);
      setSettings(config.item);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [request, date, user.preview]);
  useEffect(() => {
    void load();
  }, [load]);
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = e.currentTarget,
      data = new FormData(form);
    try {
      await request('/api/v1/calendar' + (selected ? '/' + selected.id : ''), {
        method: selected ? 'PUT' : 'POST',
        body: JSON.stringify({
          title: data.get('title'),
          kind: data.get('kind'),
          description: data.get('description'),
          leadId: data.get('leadId') || null,
          startsAt: new Date(String(data.get('startsAt'))).toISOString(),
          endsAt: new Date(String(data.get('endsAt'))).toISOString(),
          meetingUrl: data.get('meetingUrl'),
          status: data.get('status') ?? 'scheduled',
          ...(selected ? { version: selected.version } : {}),
        }),
      });
      setSelected(undefined);
      form.reset();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const config = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await request('/api/v1/calendar/settings', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: data.get('enabled') === 'on',
          weekdays: data.getAll('weekdays').map(Number),
          startHour: Number(data.get('startHour')),
          endHour: Number(data.get('endHour')),
          durationMinutes: Number(data.get('durationMinutes')),
          version: settings?.version ?? 0,
        }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="calendar-events">
      <div className="calendar-events-heading">
        <div>
          <h2>
            <CalendarDays /> Reuniões & follow-ups
          </h2>
          <p>Compromissos conectados aos contatos. Horários exibidos no fuso do dispositivo.</p>
        </div>
        <label>
          Semana a partir de
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {error && (
        <p role="alert" className="workspace-notice">
          {error}
        </p>
      )}
      <div className="portal-grid">
        <Card>
          <div className="calendar-list">
            {items.map((item) => (
              <button
                className="calendar-entry"
                key={item.id}
                onClick={() => {
                  setSelected(item);
                  setError('');
                }}
              >
                <time>
                  <strong>
                    {new Date(item.starts_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </strong>
                  {new Date(item.starts_at).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {names[item.kind]} · {names[item.status]}
                    {item.source === 'foundry' ? ' · Foundry IA' : ''}
                  </small>
                </span>
                <Clock size={16} />
              </button>
            ))}
            {!items.length && (
              <div className="calendar-empty">
                <CalendarDays size={48} />
                <h3>Espaço para a próxima conversa.</h3>
                <p>Cadastre uma reunião ou configure os horários que a Foundry pode reservar.</p>
              </div>
            )}
          </div>
          <details className="calendar-settings">
            <summary>Disponibilidade para a Foundry</summary>
            <p>
              A automação começa desativada. Ative somente os horários em que você atende, no fuso
              de Brasília.
            </p>
            {canEdit && (
              <form className="agency-form" onSubmit={config} key={settings?.version ?? 0}>
                <label className="check-label">
                  <input type="checkbox" name="enabled" defaultChecked={settings?.enabled} />
                  Permitir reservas pela Foundry
                </label>
                <fieldset>
                  <legend>Dias disponíveis</legend>
                  <div className="calendar-weekdays">
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, i) => (
                      <label key={day}>
                        <input
                          type="checkbox"
                          name="weekdays"
                          value={i}
                          defaultChecked={(settings?.weekdays ?? [1, 2, 3, 4, 5]).includes(i)}
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="company-grid">
                  <label>
                    Início (Brasília)
                    <input
                      type="number"
                      min={0}
                      max={22}
                      name="startHour"
                      defaultValue={settings?.start_hour ?? 9}
                    />
                  </label>
                  <label>
                    Fim (Brasília)
                    <input
                      type="number"
                      min={1}
                      max={23}
                      name="endHour"
                      defaultValue={settings?.end_hour ?? 18}
                    />
                  </label>
                  <label>
                    Duração (minutos)
                    <input
                      type="number"
                      min={15}
                      max={120}
                      name="durationMinutes"
                      defaultValue={settings?.duration_minutes ?? 30}
                    />
                  </label>
                </div>
                <Button disabled={busy}>Salvar disponibilidade</Button>
              </form>
            )}
          </details>
        </Card>
        <Card>
          <h2>{selected ? 'Editar compromisso' : 'Agendar conversa'}</h2>
          <form className="agency-form" key={selected?.id ?? 'new'} onSubmit={save}>
            <label>
              Título
              <input
                name="title"
                required
                minLength={3}
                maxLength={180}
                defaultValue={selected?.title}
              />
            </label>
            <div className="company-grid">
              <label>
                Tipo
                <select name="kind" defaultValue={selected?.kind ?? 'meeting'}>
                  {['meeting', 'followup', 'event'].map((k) => (
                    <option key={k} value={k}>
                      {names[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Contato
                <select name="leadId" defaultValue={selected?.lead_id ?? ''}>
                  <option value="">Sem vínculo</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Começa em
                <input
                  type="datetime-local"
                  required
                  name="startsAt"
                  defaultValue={selected ? localValue(selected.starts_at) : date + 'T09:00'}
                />
              </label>
              <label>
                Termina em
                <input
                  type="datetime-local"
                  required
                  name="endsAt"
                  defaultValue={selected ? localValue(selected.ends_at) : date + 'T09:30'}
                />
              </label>
            </div>
            <label>
              <Video size={16} /> Link da reunião (opcional)
              <input
                name="meetingUrl"
                type="url"
                placeholder="https://"
                defaultValue={selected?.meeting_url}
              />
            </label>
            <label>
              Notas
              <textarea name="description" maxLength={10000} defaultValue={selected?.description} />
            </label>
            {selected && (
              <label>
                Status
                <select name="status" defaultValue={selected.status}>
                  {['scheduled', 'completed', 'cancelled'].map((k) => (
                    <option key={k} value={k}>
                      {names[k]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="module-actions">
              <Button disabled={busy || (!canEdit && Boolean(selected))}>
                {selected ? 'Salvar alterações' : 'Reservar horário'}
              </Button>
              {selected && (
                <Button type="button" variant="ghost" onClick={() => setSelected(undefined)}>
                  Novo compromisso
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>
    </section>
  );
}
