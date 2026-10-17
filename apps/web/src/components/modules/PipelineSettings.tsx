import { useEffect, useState } from 'react';
import { Settings2, ArrowUp, ArrowDown, Plus, X } from 'lucide-react';
import { Button, Card } from '@dcfoundry/ui';
import { resolveGrantedScope, type PipelineStage } from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi } from './useModule.js';
export function PipelineSettings({
  user,
  stages,
  version,
}: {
  user: AuthenticatedSession;
  stages: PipelineStage[];
  version: number;
}) {
  const request = useCrmApi(user),
    [draft, setDraft] = useState(stages),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    setDraft(stages);
  }, [stages, version]);
  if (!resolveGrantedScope(user.roles, 'pipeline:manage')) return null;
  const patch = (index: number, value: Partial<PipelineStage>) =>
    setDraft((current) => current.map((s, i) => (i === index ? { ...s, ...value } : s)));
  const reorder = (index: number, delta: number) =>
    setDraft((current) => {
      const next = [...current],
        target = index + delta;
      if (target < 1 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await request('/api/v1/pipeline', {
        method: 'PUT',
        body: JSON.stringify({ version, stages: draft }),
      });
      window.dispatchEvent(new Event('crm:pipeline-changed'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="pipeline-settings">
      <summary>
        <Settings2 size={16} />
        Configurar etapas do funil
      </summary>
      <Card>
        <p>
          Ajuste a ordem e a meta de resposta de cada etapa. Contatos arquivados preservam sua etapa
          e os anexos.
        </p>
        <div className="pipeline-editor-list">
          {draft.map((stage, index) => (
            <div key={stage.id}>
              <label>
                Etapa
                <input
                  value={stage.name}
                  maxLength={120}
                  onChange={(e) => patch(index, { name: e.target.value })}
                />
              </label>
              <label>
                Cor
                <input
                  type="color"
                  value={stage.color}
                  onChange={(e) => patch(index, { color: e.target.value })}
                />
              </label>
              <label>
                SLA (minutos)
                <input
                  type="number"
                  min={1}
                  max={43200}
                  value={stage.slaMinutes}
                  onChange={(e) => patch(index, { slaMinutes: Number(e.target.value) })}
                />
              </label>
              <label>
                <input
                  type="radio"
                  name="pipeline-won"
                  checked={stage.isWon}
                  onChange={() =>
                    setDraft((current) =>
                      current.map((s, i) => ({
                        ...s,
                        isWon: i === index,
                        isLost: i === index ? false : s.isLost,
                      })),
                    )
                  }
                />
                Ganho
              </label>
              <label>
                <input
                  type="radio"
                  name="pipeline-lost"
                  checked={stage.isLost}
                  onChange={() =>
                    setDraft((current) =>
                      current.map((s, i) => ({
                        ...s,
                        isLost: i === index,
                        isWon: i === index ? false : s.isWon,
                      })),
                    )
                  }
                />
                Perdido
              </label>
              <div className="module-actions">
                <button
                  className="icon-button"
                  aria-label={'Subir ' + stage.name}
                  disabled={index <= 1}
                  onClick={() => reorder(index, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={'Descer ' + stage.name}
                  disabled={index === 0 || index === draft.length - 1}
                  onClick={() => reorder(index, 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={'Remover ' + stage.name}
                  disabled={stage.id === 'novo'}
                  onClick={() => setDraft((current) => current.filter((s) => s.id !== stage.id))}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="module-actions">
          <Button
            variant="outline"
            disabled={draft.length >= 20}
            onClick={() =>
              setDraft((current) => [
                ...current,
                {
                  id: 'etapa-' + crypto.randomUUID().slice(0, 8),
                  name: 'Nova etapa',
                  color: '#246ba5',
                  slaMinutes: 60,
                  isWon: false,
                  isLost: false,
                },
              ])
            }
          >
            <Plus size={16} />
            Adicionar etapa
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {busy ? 'Salvando…' : 'Salvar funil'}
          </Button>
        </div>
        {error && <p role="alert">{error}</p>}
      </Card>
    </details>
  );
}
