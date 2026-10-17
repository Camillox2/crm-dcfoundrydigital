import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '@dcfoundry/ui';
import { resolveGrantedScope } from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi } from './useModule.js';
export function LeadAttribution({ user, leadId }: { user: AuthenticatedSession; leadId: string }) {
  const request = useCrmApi(user),
    [data, setData] = useState<any>(),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const load = useCallback(async () => {
    try {
      setData((await request('/api/v1/leads/' + leadId + '/attribution')).item);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [request, leadId]);
  useEffect(() => {
    void load();
  }, [load]);
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError('');
    setSaved(false);
    try {
      await request('/api/v1/leads/' + leadId + '/attribution', {
        method: 'PUT',
        body: JSON.stringify({ attribution: Object.fromEntries(form), version: data.version }),
      });
      setSaved(true);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <details className="lead-attribution">
      <summary>Origem, UTM e consentimento</summary>
      {data && (
        <form className="agency-form" key={data.version} onSubmit={save}>
          <div className="company-grid">
            {[
              ['utmSource', 'Origem'],
              ['utmMedium', 'Mídia'],
              ['utmCampaign', 'Campanha'],
              ['utmTerm', 'Termo'],
              ['utmContent', 'Conteúdo'],
              ['gclid', 'GCLID'],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  name={key}
                  defaultValue={data[key!]}
                  maxLength={key === 'gclid' ? 512 : 200}
                />
              </label>
            ))}
          </div>
          <label>
            Consentimento para uso em Ads
            <select name="adConsent" defaultValue={data.adConsent}>
              <option value="unknown">Não informado</option>
              <option value="granted">Concedido pelo contato</option>
              <option value="denied">Negado pelo contato</option>
            </select>
          </label>
          <p className="agency-help">
            Registre a escolha real do contato. GCLID é removido quando o consentimento não está
            concedido. Conversões não são enviadas sem concessão.
          </p>
          <Button disabled={!resolveGrantedScope(user.roles, 'lead:update')}>
            Salvar atribuição
          </Button>
          {data.adConsentAt && (
            <small>
              Escolha registrada em {new Date(data.adConsentAt).toLocaleString('pt-BR')}
            </small>
          )}
        </form>
      )}
      {saved && <p role="status">Atribuição atualizada.</p>}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
