import { useCallback, useEffect, useState } from 'react';
import { Sparkles, Play, Pause, FlaskConical } from 'lucide-react';
import { Button, Card, FoundryMascot } from '@dcfoundry/ui';
import { resolveGrantedScope } from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi } from './useModule.js';
export function FoundryLab({ user }: { user: AuthenticatedSession }) {
  const request = useCrmApi(user),
    [settings, setSettings] = useState<{ whatsapp_enabled: boolean; version: number }>(),
    [scenarios, setScenarios] = useState<{ slug: string; title: string; message: string }[]>([]),
    [result, setResult] = useState<{
      answer: string;
      model: string;
      passed: boolean;
      handoff: boolean;
    }>(),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    if (user.preview) return;
    try {
      const [config, lab] = await Promise.all([
        request('/api/v1/foundry/settings'),
        request('/api/v1/foundry/lab/scenarios'),
      ]);
      setSettings(config.item);
      setScenarios(lab.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [request, user.preview]);
  useEffect(() => {
    void load();
  }, [load]);
  const toggle = async () => {
    if (!settings) return;
    setBusy('settings');
    setError('');
    try {
      await request('/api/v1/foundry/settings', {
        method: 'PUT',
        body: JSON.stringify({
          whatsappEnabled: !settings.whatsapp_enabled,
          version: settings.version,
        }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const run = async (slug: string) => {
    setBusy(slug);
    setError('');
    try {
      setResult(
        await request('/api/v1/foundry/lab/run', {
          method: 'POST',
          body: JSON.stringify({ scenario: slug }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="module-workspace">
      <Card className="foundry-control-banner">
        <FoundryMascot size={72} />
        <div>
          <h3>Uma Foundry. A mesma base.</h3>
          <p>
            O chat interno e o WhatsApp usam as orientações compartilhadas. Conhecimentos marcados
            como internos ficam restritos à equipe.
          </p>
          <strong>
            WhatsApp:{' '}
            {settings?.whatsapp_enabled ? 'respostas automáticas ativas' : 'aguardando ativação'}
          </strong>
        </div>
        <Button
          variant="outline"
          disabled={
            Boolean(busy) || !settings || !resolveGrantedScope(user.roles, 'ai_agent:update')
          }
          onClick={() => void toggle()}
        >
          {settings?.whatsapp_enabled ? <Pause size={16} /> : <Play size={16} />}{' '}
          {settings?.whatsapp_enabled ? 'Pausar agente' : 'Ativar no WhatsApp'}
        </Button>
      </Card>
      <Card>
        <h3>
          <FlaskConical size={20} />
          Laboratório da Foundry
        </h3>
        <p>
          Teste os cenários fixos com a base atual. As execuções não criam leads, não enviam
          mensagens e não alteram conversas reais.
        </p>
        <div className="foundry-lab-grid">
          {scenarios.map((s) => (
            <article key={s.slug}>
              <strong>{s.title}</strong>
              <p>{s.message}</p>
              <Button variant="outline" disabled={Boolean(busy)} onClick={() => void run(s.slug)}>
                {busy === s.slug ? 'Testando…' : 'Executar cenário'}
              </Button>
            </article>
          ))}
        </div>
        {result && (
          <div className="foundry-lab-result" role="status">
            <strong>{result.passed ? 'Comportamento esperado' : 'Revisar comportamento'}</strong>
            <p>{result.answer}</p>
            <small>
              Modelo: {result.model} ·{' '}
              {result.handoff ? 'Encaminhou para humano' : 'Continuou qualificação'}
            </small>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </Card>
    </div>
  );
}
export function LeadFoundry({ user, leadId }: { user: AuthenticatedSession; leadId: string }) {
  const request = useCrmApi(user),
    [state, setState] = useState<{
      paused: boolean;
      revision: number;
      reason: string | null;
      summary: string | null;
      facts: Record<string, unknown>;
    }>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    if (user.preview) return;
    try {
      setState(await request(`/api/v1/leads/${leadId}/foundry`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [request, leadId, user.preview]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);
  const control = async () => {
    if (!state) return;
    setBusy(true);
    setError('');
    try {
      await request(`/api/v1/leads/${leadId}/foundry`, {
        method: 'PUT',
        body: JSON.stringify({ paused: !state.paused, revision: state.revision }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const summary = async () => {
    setBusy(true);
    setError('');
    try {
      await request(`/api/v1/leads/${leadId}/ai-summary`, { method: 'POST' });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const labels: Record<string, string> = {
    projectType: 'Tipo de projeto',
    objective: 'Objetivo',
    budgetCents: 'Orçamento informado',
    deadline: 'Prazo informado',
    decisionMaker: 'Quem decide',
    urgency: 'Urgência',
  };
  return (
    <div className="foundry-lead-control">
      <details>
        <summary>
          <Sparkles size={15} />
          Foundry IA · {state?.paused ? 'Pausada neste contato' : 'Qualificação disponível'}
        </summary>
        {state?.reason && <p>{state.reason}</p>}
        <dl>
          {Object.entries(state?.facts ?? {})
            .filter(([, v]) => v !== null && v !== undefined)
            .map(([key, value]) => (
              <div key={key}>
                <dt>{labels[key] ?? key}</dt>
                <dd>
                  {key === 'budgetCents'
                    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                        Number(value) / 100,
                      )
                    : String(value)}
                </dd>
              </div>
            ))}
        </dl>
        <Button variant="outline" disabled={busy || !state} onClick={() => void summary()}>
          Gerar resumo do lead
        </Button>
        {state?.summary && <p className="foundry-lead-summary">{state.summary}</p>}
      </details>
      <Button
        variant="ghost"
        disabled={busy || !state || !resolveGrantedScope(user.roles, 'lead:update')}
        onClick={() => void control()}
      >
        {state?.paused ? <Play size={14} /> : <Pause size={14} />}{' '}
        {state?.paused ? 'Retomar Foundry' : 'Assumir atendimento'}
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
