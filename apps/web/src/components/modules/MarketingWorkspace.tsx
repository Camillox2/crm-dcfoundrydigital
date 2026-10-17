import { useEffect, useState } from 'react';
import { Copy, FileDown, Upload } from 'lucide-react';
import { Card } from '@dcfoundry/ui';
import { CampaignInput } from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi } from './useModule.js';
import { ModuleNotice } from './ModuleTools.js';
import { RecordsModule } from './RecordsModule.js';
import { OfflineAdsPanel } from './OfflineAdsPanel.js';

function parseCsv(text: string) {
  const delimiter = (text.split(/\r?\n/)[0] ?? '').includes(';') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' && !quoted) {
      row.push(cell.replace(/\r$/, ''));
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  if (quoted) throw new Error('CSV com aspas não fechadas.');
  return rows;
}
export function MarketingWorkspace({ user }: { user: AuthenticatedSession }) {
  const request = useCrmApi(user),
    [status, setStatus] = useState<{ adsIngest: boolean } | null>(null),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!user.accessToken || user.preview) return;
    const c = new AbortController();
    request('/api/v1/workspace/integrations', { signal: c.signal })
      .then(setStatus)
      .catch(() => {});
    return () => c.abort();
  }, [request, user.accessToken, user.preview]);
  const importFile = async (file: File) => {
    if (file.size > 1_000_000) {
      setError('Use um CSV de até 1 MB.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const rows = parseCsv((await file.text()).replace(/^\uFEFF/, ''));
      const headers = rows.shift() ?? [];
      if (rows.length > 500) throw new Error('Importe até 500 linhas por vez.');
      const number = (v: string | undefined) => Number((v ?? '0').replace(',', '.'));
      const items = rows.map((cells) => {
        const d = Object.fromEntries(headers.map((h, i) => [h.trim(), cells[i]?.trim() ?? '']));
        return CampaignInput.parse({
          title: d.title,
          campaignId: d.campaignId,
          account: d.account ?? '',
          date: d.date,
          costCents: Math.round(number(d.cost) * 100),
          impressions: number(d.impressions),
          clicks: number(d.clicks),
          conversions: number(d.conversions),
          currency: 'BRL',
        });
      });
      const result = await request('/api/v1/workspace/campaign-import', {
        method: 'POST',
        body: JSON.stringify({ items }),
      });
      setNotice(
        `${result.imported} métricas importadas. Campanhas da mesma conta e data foram atualizadas.`,
      );
      setRevision((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const template = () => {
    const url = URL.createObjectURL(
      new Blob(['\uFEFFtitle;campaignId;account;date;cost;impressions;clicks;conversions\r\n'], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo-metricas-google-ads.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="module-workspace">
      <OfflineAdsPanel user={user} />
      <Card className="ads-import-panel">
        <div>
          <h3>Do relatório à decisão.</h3>
          <p>
            Adicione métricas manualmente ou importe CSV. O seu script pode ser conectado depois.
          </p>
        </div>
        <div className="module-actions">
          <button className="module-filter" onClick={template}>
            <FileDown size={16} />
            Baixar modelo CSV
          </button>
          <label className="module-primary-link">
            <Upload size={16} />
            {busy ? 'Importando...' : 'Importar CSV'}
            <input
              className="visually-hidden-input"
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFile(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </Card>
      {error && <ModuleNotice error>{error}</ModuleNotice>}
      {notice && <ModuleNotice>{notice}</ModuleNotice>}
      <RecordsModule key={revision} kind="campaign" user={user} />
      <Card className="ads-script-help">
        <h3>Recebimento do seu script</h3>
        <p>
          Endpoint: <code>/api/v1/integrations/ads/metrics</code>
        </p>
        <p>
          Estado:{' '}
          {status?.adsIngest
            ? 'token configurado no servidor'
            : 'aguardando CRM_ADS_INGEST_TOKEN no VPS'}
          . A chave não é exibida no navegador.
        </p>
        <details>
          <summary>Formato de envio</summary>
          <pre>
            {JSON.stringify(
              {
                ownerId: 'ID_DO_USUARIO_RESPONSAVEL',
                items: [
                  {
                    title: 'Nome da campanha',
                    campaignId: 'ID_GOOGLE_ADS',
                    account: 'ID_DA_CONTA',
                    date: 'AAAA-MM-DD',
                    costCents: 0,
                    impressions: 0,
                    clicks: 0,
                    conversions: 0,
                    currency: 'BRL',
                  },
                ],
              },
              null,
              2,
            )}
          </pre>
          <p>
            Envie JSON com Authorization: Bearer e o token configurado. Os valores monetários do
            endpoint são em centavos. No CSV, cost é em reais. Cliques e conversões importados não
            são automaticamente classificados como vendas.
          </p>
        </details>
      </Card>
    </div>
  );
}
