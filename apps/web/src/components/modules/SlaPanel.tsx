import { useCallback, useEffect, useState } from 'react';
import { Card } from '@dcfoundry/ui';
import { Clock, UserRoundCheck } from 'lucide-react';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi } from './useModule.js';
export function SlaPanel({ user }: { user: AuthenticatedSession }) {
  const request = useCrmApi(user),
    [data, setData] = useState<any>(),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    if (user.preview) return;
    try {
      setData(await request('/api/v1/reports/human-sla'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [request, user.preview]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    return () => clearInterval(timer);
  }, [load]);
  const time = (value: number | null) =>
    value === null ? 'Sem respostas' : value < 1 ? '< 1 min' : Math.round(value) + ' min';
  return (
    <Card className="sla-panel">
      <header>
        <div>
          <h3>
            <UserRoundCheck size={20} /> Atendimento humano
          </h3>
          <p>Últimos 30 dias · respostas da Foundry não contam como atendimento humano.</p>
        </div>
        <Clock size={20} />
      </header>
      {error ? (
        <p role="alert">{error}</p>
      ) : data?.available === false ? (
        <p>Seu perfil não tem acesso às métricas de atendimento.</p>
      ) : (
        <>
          <div className="sla-metrics">
            <div>
              <strong>{data ? time(data.medianMinutes) : '—'}</strong>
              <span>Mediana da primeira resposta</span>
            </div>
            <div>
              <strong>{data ? time(data.p90Minutes) : '—'}</strong>
              <span>90% das respostas em até</span>
            </div>
            <div>
              <strong>{data?.awaiting ?? '—'}</strong>
              <span>Aguardando uma pessoa</span>
            </div>
            <div>
              <strong>{data?.overdue ?? '—'}</strong>
              <span>Acima do SLA da etapa</span>
            </div>
          </div>
          {data?.waiting?.length > 0 && (
            <details>
              <summary>Ver contatos aguardando atendimento</summary>
              <ul className="sla-waiting">
                {data.waiting.map((item: any) => (
                  <li key={item.channel + item.leadId}>
                    <strong>{item.name}</strong>
                    <span>
                      {item.channel === 'website' ? 'Site' : 'WhatsApp'} ·{' '}
                      {time(item.waitingMinutes)} · meta {item.slaMinutes} min
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {data?.truncated && <p>Volume acima de 10 mil mensagens: esta amostra está limitada.</p>}
        </>
      )}
    </Card>
  );
}
