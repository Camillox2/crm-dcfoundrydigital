import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileSignature, Sparkles, UserRound, X } from 'lucide-react';
import type { WorkspaceLead } from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { LeadAttribution } from '../modules/LeadAttribution.js';
import { LeadExtras } from '../modules/LeadExtras.js';
import { useCrmApi } from '../modules/useModule.js';
import type { ConversationRow } from './types.js';

type SaveState = 'Salvo' | 'Salvando' | 'Erro';

export function LeadPanel({
  user,
  row,
  lead,
  summary,
  open,
  onClose,
}: {
  user: AuthenticatedSession;
  row: ConversationRow;
  lead?: WorkspaceLead;
  summary: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const request = useCrmApi(user);
  const [draft, setDraft] = useState({
    name: lead?.name ?? row.name ?? '',
    company: lead?.company ?? row.company ?? '',
    phone: lead?.phone ?? row.phone ?? '',
    scopeSummary: lead?.scopeSummary ?? row.scope_summary ?? '',
    modality: lead?.modality ?? 'Projeto Fechado',
    monthlyValue: lead?.monthlyValue ?? 0,
    notes: lead?.notes ?? '',
    stage: lead?.stage ?? 'novo',
    campaign: lead?.campaign ?? row.campaign ?? '',
    highPriority: lead?.highPriority ?? false,
  });
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const [state, setState] = useState<SaveState>('Salvo');
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (dirty) return;
    setDraft({
      name: lead?.name ?? row.name ?? '',
      company: lead?.company ?? row.company ?? '',
      phone: lead?.phone ?? row.phone ?? '',
      scopeSummary: lead?.scopeSummary ?? row.scope_summary ?? '',
      modality: lead?.modality ?? 'Projeto Fechado',
      monthlyValue: lead?.monthlyValue ?? 0,
      notes: lead?.notes ?? '',
      stage: lead?.stage ?? 'novo',
      campaign: lead?.campaign ?? row.campaign ?? '',
      highPriority: lead?.highPriority ?? false,
    });
    setDirty(false);
    setState('Salvo');
  }, [dirty, lead, row.id, row.name, row.company, row.phone, row.scope_summary, row.campaign]);
  useEffect(() => {
    if (user.preview) return;
    void request('/api/v1/pipeline')
      .then((data) => setStages(data.stages ?? []))
      .catch(() => undefined);
  }, [request, user.preview]);
  useEffect(() => {
    if (!dirty || user.preview || !lead) return;
    setState('Salvando');
    const timer = setTimeout(() => {
      void request(`/api/v1/workspace/leads/${lead.id}`, {
        method: 'PUT',
        body: JSON.stringify(draft),
      })
        .then(() => {
          if (draft.stage !== lead.stage)
            return request(`/api/v1/workspace/leads/${lead.id}/stage`, {
              method: 'PATCH',
              body: JSON.stringify({ stage: draft.stage }),
            });
        })
        .then(() => {
          setState('Salvo');
          setDirty(false);
          window.dispatchEvent(new Event('crm:leads-changed'));
        })
        .catch(() => setState('Erro'));
    }, 700);
    return () => clearTimeout(timer);
  }, [dirty, draft, lead, request, user.preview]);
  const progress = useMemo(() => {
    const fields = [draft.name, draft.company, draft.phone, draft.scopeSummary, draft.notes, draft.campaign];
    return Math.round((fields.filter((item) => String(item).trim()).length / fields.length) * 100);
  }, [draft]);
  const change = (patch: Partial<typeof draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  };
  if (!open) return null;
  return (
    <aside className="wa-panel" aria-label="Ficha do lead">
      <header>
        <h3>Ficha</h3>
        <span>{state}</span>
        <button type="button" className="wa-panel-close" aria-label="Fechar ficha" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="wa-progress" aria-label={`Preenchimento ${progress}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <section>
        <h4>
          <UserRound size={16} /> Contato
        </h4>
        <label>
          Nome
          <input value={draft.name} onChange={(event) => change({ name: event.target.value })} />
        </label>
        <label>
          Empresa
          <input value={draft.company} onChange={(event) => change({ company: event.target.value })} />
        </label>
        <label>
          Telefone
          <input value={draft.phone} onChange={(event) => change({ phone: event.target.value })} />
        </label>
      </section>
      <section>
        <h4>Funil</h4>
        <label>
          Etapa
          <select value={draft.stage} onChange={(event) => change({ stage: event.target.value })}>
            {(stages.length ? stages : [{ id: draft.stage, name: lead?.stageName || draft.stage }]).map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Modalidade
          <select
            value={draft.modality}
            onChange={(event) =>
              change({ modality: event.target.value === 'Retainer Mensal' ? 'Retainer Mensal' : 'Projeto Fechado' })
            }
          >
            <option>Projeto Fechado</option>
            <option>Retainer Mensal</option>
          </select>
        </label>
        <label>
          Valor previsto (R$)
          <input type="number" min="0" step="0.01" value={draft.monthlyValue} onChange={(event) => change({ monthlyValue: Number(event.target.value) })} />
        </label>
      </section>
      <section>
        <h4>Escopo</h4>
        <textarea value={draft.scopeSummary} rows={3} onChange={(event) => change({ scopeSummary: event.target.value })} />
        <label>
          Origem
          <input value={draft.campaign} onChange={(event) => change({ campaign: event.target.value })} />
        </label>
      </section>
      <section>
        <h4>Notas</h4>
        <textarea value={draft.notes} rows={3} onChange={(event) => change({ notes: event.target.value })} />
      </section>
      <section>
        <h4>
          <Sparkles size={16} /> Foundry
        </h4>
        <p>{summary || 'O resumo aparece depois que a Foundry organizar a conversa.'}</p>
      </section>
      {lead && !user.preview && (
        <>
          <LeadExtras user={user} leadId={lead.id} />
          <LeadAttribution user={user} leadId={lead.id} />
        </>
      )}
      <div className="wa-panel-actions">
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('crm:open-page', { detail: 'contracts' }))}>
          <FileSignature size={15} /> Gerar proposta
        </button>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('crm:open-page', { detail: 'agenda' }))}>
          <CalendarDays size={15} /> Agendar
        </button>
      </div>
    </aside>
  );
}
