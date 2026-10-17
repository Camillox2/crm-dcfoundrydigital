import { useState } from 'react';
import { Button, Card } from '@dcfoundry/ui';
import { Upload } from 'lucide-react';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi } from './useModule.js';
export function LeadImport({
  user,
  onImported,
}: {
  user: AuthenticatedSession;
  onImported: () => void;
}) {
  const request = useCrmApi(user),
    [csv, setCsv] = useState(''),
    [preview, setPreview] = useState<any>(),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [batchId, setBatchId] = useState('');
  return (
    <details className="lead-import">
      <summary>
        <Upload size={16} /> Importar contatos por CSV
      </summary>
      <Card>
        <h3>Seus contatos, com uma prévia antes.</h3>
        <p>
          Até 500 linhas e 1 MB. Cabeçalhos: nome, empresa, telefone. Opcionais: objetivo, notas,
          campanha, utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid e
          consentimento_ads (unknown, granted ou denied).
        </p>
        <code>
          nome;empresa;telefone
          <br />
          Cliente de exemplo;Projeto de exemplo;+5541999999999
        </code>
        <label>
          Arquivo CSV
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              setPreview(undefined);
              setError('');
              setNotice('');
              setBatchId(crypto.randomUUID());
              if (file) {
                if (file.size > 1000000) {
                  setError('Escolha um CSV de até 1 MB.');
                  return;
                }
                setCsv(await file.text());
              }
            }}
          />
        </label>
        <label>
          Ou cole o conteúdo
          <textarea
            value={csv}
            maxLength={1000000}
            rows={5}
            onChange={(e) => {
              setCsv(e.target.value);
              setPreview(undefined);
              setBatchId(crypto.randomUUID());
            }}
          />
        </label>
        <Button
          disabled={busy || !csv}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              setPreview(
                await request('/api/v1/leads/import/preview', {
                  method: 'POST',
                  body: JSON.stringify({ csv }),
                }),
              );
              if (!batchId) setBatchId(crypto.randomUUID());
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Validar e conferir prévia
        </Button>
        {preview && (
          <div className="import-preview">
            <strong>
              {preview.valid} novos · {preview.duplicates} duplicados · {preview.errors.length}{' '}
              erros
            </strong>
            {preview.errors.map((e: any) => (
              <p key={e.row}>
                Linha {e.row}: {e.message}
              </p>
            ))}
            <Button
              disabled={busy || preview.errors.length > 0 || preview.valid === 0}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await request('/api/v1/leads/import', {
                    method: 'POST',
                    body: JSON.stringify({ csv, id: batchId, expectedHash: preview.hash }),
                  });
                  setNotice(
                    result.imported +
                      ' contatos importados; ' +
                      result.duplicates +
                      ' duplicados preservados.',
                  );
                  setPreview(undefined);
                  setCsv('');
                  onImported();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirmar importação de {preview.valid} contatos
            </Button>
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert">{error}</p>}
      </Card>
    </details>
  );
}
