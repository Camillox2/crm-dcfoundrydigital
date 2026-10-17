import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Card } from '@dcfoundry/ui';
import { useCrmApi, useModule } from './useModule.js';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
const labels: Record<string, string> = {
  queued: 'Na fila',
  validated: 'Validado sem envio comercial',
  provider_accepted: 'Recebido pelo Google; aguardando diagnóstico',
  processed: 'Processado pelo Google',
  partial_failure: 'Falha parcial',
  rejected: 'Rejeitado',
  failed: 'Falha no envio',
  consent_blocked: 'Bloqueado por consentimento',
  diagnostic_pending: 'Diagnóstico pendente após 24 horas',
};
export function OfflineAdsPanel({ user }: { user: AuthenticatedSession }) {
  const request = useCrmApi(user),
    proposals = useModule('contract', user),
    charges = useModule('invoice', user),
    [data, setData] = useState<any>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [kind, setKind] = useState('proposal_accepted');
  const load = useCallback(async () => {
    if (user.preview) return;
    try {
      setData(await request('/api/v1/integrations/ads/offline'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [request, user.preview]);
  useEffect(() => {
    void load();
  }, [load]);
  const evidence = (kind === 'proposal_accepted' ? proposals.items : charges.items).filter(
    (p) =>
      p.leadId &&
      (kind === 'proposal_accepted' ? ['accepted', 'active', 'completed'] : ['paid']).includes(
        (p.data as any).status,
      ),
  );
  const queue = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget),
      item = evidence.find((p) => p.id === form.get('evidenceId'));
    if (!item) return;
    setBusy(true);
    setError('');
    try {
      await request('/api/v1/integrations/ads/offline', {
        method: 'POST',
        body: JSON.stringify({
          leadId: item.leadId,
          evidenceType: kind,
          evidenceId: item.id,
          confirmed: form.get('confirmed') === 'on',
          eventAt: new Date(String(form.get('eventAt'))).toISOString(),
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
    <Card>
      <h3>Resultados reais de volta ao Ads</h3>
      <p>
        Somente propostas aceitas e pagamentos recebidos, com GCLID e consentimento. Clique no
        WhatsApp não é venda.
      </p>
      <strong>
        {data?.configured
          ? data.validateOnly
            ? 'Modo de validação: não registra conversões reais.'
            : 'Envio comercial habilitado na configuração do servidor.'
          : 'Aguardando configuração da Data Manager API na VPS.'}
      </strong>
      <form className="agency-form" onSubmit={queue}>
        <div className="company-grid">
          <label>
            Resultado
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="proposal_accepted">Proposta aceita</option>
              <option value="payment_received">Pagamento recebido</option>
            </select>
          </label>
          <label>
            Documento
            <select name="evidenceId" required key={kind}>
              <option value="">Escolha um registro confirmado</option>
              {evidence.map((p) => (
                <option value={p.id} key={p.id}>
                  {(p.data as any).title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Data e hora real do resultado
            <input type="datetime-local" name="eventAt" required />
          </label>
        </div>
        <label className="check-label">
          <input type="checkbox" name="confirmed" required />
          Conferi o resultado e a data informada. Quero colocá-lo na fila conforme o modo do
          servidor.
        </label>
        <Button disabled={busy}>Registrar resultado na fila</Button>
      </form>
      <div className="offline-ads-list">
        {data?.items.map((item: any) => (
          <article key={item.id}>
            <div>
              <strong>
                {item.evidence_type === 'proposal_accepted'
                  ? 'Proposta aceita'
                  : 'Pagamento recebido'}
              </strong>
              <span>
                {labels[item.status] ?? item.status}
                {item.validate_only ? ' · validação' : ''}
              </span>
              <small>
                {item.warning_count} avisos · {item.error_count} erros{' '}
                {item.last_error && ' · ' + item.last_error}
              </small>
            </div>
            {['failed', 'validated', 'consent_blocked'].includes(item.status) && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await request('/api/v1/integrations/ads/offline/' + item.id + '/retry', {
                      method: 'POST',
                      body: JSON.stringify({ confirmed: true }),
                    });
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {data.validateOnly ? 'Validar novamente' : 'Confirmar envio comercial'}
              </Button>
            )}
          </article>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </Card>
  );
}
