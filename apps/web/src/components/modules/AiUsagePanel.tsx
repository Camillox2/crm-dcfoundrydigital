import { useEffect, useState } from 'react';
import { Card } from '@dcfoundry/ui';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi } from './useModule.js';
import { ModuleNotice } from './ModuleTools.js';

interface Counts {
  calls: number;
  success: number;
  quota: number;
  errors: number;
  tokens: number;
}
interface Usage {
  days: 7 | 30;
  totals: Counts & { successRate: number };
  byModel: (Counts & { model: string; successRate: number; avgLatencyMs: number })[];
  daily: (Counts & { date: string })[];
  byFeature?: (Counts & { feature: string; successRate: number })[];
}
const FEATURE_LABEL: Record<string, string> = {
  assistant_chat: 'Chat interno',
  whatsapp_auto: 'WhatsApp (automático)',
  site_chat: 'Chat do site',
  foundry_lab: 'Laboratório',
  lead_summary: 'Resumo de lead',
};
const fmt = new Intl.NumberFormat('pt-BR');

function ModelBars({ rows }: { rows: Usage['byModel'] }) {
  const max = Math.max(1, ...rows.map((r) => r.calls));
  const rowHeight = 34;
  return (
    <svg
      className="ai-usage-chart"
      viewBox={`0 0 640 ${rows.length * rowHeight + 8}`}
      role="img"
      aria-label="Chamadas por modelo"
    >
      {rows.map((r, i) => {
        const y = i * rowHeight + 4;
        const width = (w: number) => (w / max) * 380;
        return (
          <g key={r.model}>
            <text x="0" y={y + 18} className="ai-usage-label">
              {r.model}
            </text>
            <rect x="220" y={y + 4} height="20" rx="6" width={width(r.success)} className="ok" />
            <rect
              x={220 + width(r.success)}
              y={y + 4}
              height="20"
              width={width(r.quota)}
              className="quota"
            />
            <rect
              x={220 + width(r.success + r.quota)}
              y={y + 4}
              height="20"
              width={width(r.errors)}
              className="error"
            />
            <text x={226 + width(r.calls)} y={y + 19} className="ai-usage-value">
              {r.calls}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DailyLine({ rows }: { rows: Usage['daily'] }) {
  const max = Math.max(1, ...rows.map((r) => r.calls));
  const w = 640,
    h = 180,
    pad = 28;
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, rows.length - 1);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const line = (key: 'calls' | 'success') =>
    rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join(' ');
  return (
    <svg className="ai-usage-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Chamadas por dia">
      <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} className="axis" />
      <path d={line('calls')} className="line-calls" />
      <path d={line('success')} className="line-success" />
      {rows.map((r, i) => (
        <g key={r.date}>
          <circle cx={x(i)} cy={y(r.calls)} r="3.5" className="dot">
            <title>{`${r.date}: ${r.calls} chamadas, ${r.success} ok, ${r.quota} cota, ${fmt.format(r.tokens)} tokens`}</title>
          </circle>
          {(rows.length <= 7 || i % 5 === 0 || i === rows.length - 1) && (
            <text x={x(i)} y={h - 8} textAnchor="middle" className="ai-usage-label">
              {r.date.slice(8, 10)}/{r.date.slice(5, 7)}
            </text>
          )}
        </g>
      ))}
      <text x={pad} y={14} className="ai-usage-label">
        máx. {max}
      </text>
    </svg>
  );
}

export function AiUsagePanel({ user }: { user: AuthenticatedSession }) {
  const request = useCrmApi(user);
  const [days, setDays] = useState<7 | 30>(7),
    [usage, setUsage] = useState<Usage | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setError('');
    request(`/api/v1/workspace/ai-usage?days=${days}`)
      .then((data) => active && setUsage(data as Usage))
      .catch((e) => active && setError((e as Error).message));
    return () => {
      active = false;
    };
  }, [days, request]);
  return (
    <div className="ai-usage">
      <div className="module-tabs">
        {([7, 30] as const).map((d) => (
          <button key={d} aria-pressed={days === d} onClick={() => setDays(d)}>
            Últimos {d} dias
          </button>
        ))}
      </div>
      {error && <ModuleNotice error>{error}</ModuleNotice>}
      {usage && (
        <>
          <div className="ai-usage-kpis">
            {[
              ['Chamadas', fmt.format(usage.totals.calls)],
              ['Sucesso', `${usage.totals.successRate}%`],
              ['Cota (429)', fmt.format(usage.totals.quota)],
              ['Erros', fmt.format(usage.totals.errors)],
              ['Tokens', fmt.format(usage.totals.tokens)],
            ].map(([label, value]) => (
              <Card key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </Card>
            ))}
          </div>
          <Card>
            <h3>Chamadas por modelo</h3>
            {usage.byModel.length ? (
              <>
                <ModelBars rows={usage.byModel} />
                <p className="ai-usage-legend">
                  <span className="ok" /> sucesso <span className="quota" /> cota 429{' '}
                  <span className="error" /> erro
                </p>
              </>
            ) : (
              <p>Nenhuma chamada registrada no período.</p>
            )}
          </Card>
          <Card>
            <h3>Chamadas por dia</h3>
            <DailyLine rows={usage.daily} />
            <p className="ai-usage-legend">
              <span className="line-calls" /> chamadas <span className="line-success" /> sucesso
            </p>
          </Card>
          {(usage.byFeature?.length ?? 0) > 0 && (
            <Card>
              <table className="ai-usage-table">
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th>Chamadas</th>
                    <th>Sucesso</th>
                    <th>429</th>
                    <th>Erros</th>
                    <th>Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.byFeature!.map((r) => (
                    <tr key={r.feature}>
                      <td>{FEATURE_LABEL[r.feature] ?? r.feature}</td>
                      <td>{r.calls}</td>
                      <td>{r.successRate}%</td>
                      <td>{r.quota}</td>
                      <td>{r.errors}</td>
                      <td>{fmt.format(r.tokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          {usage.byModel.length > 0 && (
            <Card>
              <table className="ai-usage-table">
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th>Chamadas</th>
                    <th>Sucesso</th>
                    <th>429</th>
                    <th>Erros</th>
                    <th>Latência média</th>
                    <th>Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.byModel.map((r) => (
                    <tr key={r.model}>
                      <td>{r.model}</td>
                      <td>{r.calls}</td>
                      <td>{r.successRate}%</td>
                      <td>{r.quota}</td>
                      <td>{r.errors}</td>
                      <td>{fmt.format(r.avgLatencyMs)} ms</td>
                      <td>{fmt.format(r.tokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
