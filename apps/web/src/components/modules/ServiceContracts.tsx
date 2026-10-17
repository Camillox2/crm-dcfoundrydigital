import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { FileSignature, Link as LinkIcon, Mail, MessageSquare, Printer, X } from 'lucide-react';
import { Button, Card } from '@dcfoundry/ui';
import {
  ContractGenerationInput,
  resolveGrantedScope,
  type ContractData,
  type ContractTerms,
  type WorkspaceLead,
} from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi, useModule } from './useModule.js';
import { RecordsModule } from './RecordsModule.js';
import { ContractPaper, type ContractDocument } from '../../pages/ContractSignaturePage.js';
import { money, statusLabel } from './ModuleTools.js';
type Agreement = {
  id: string;
  title: string;
  client_name: string;
  client_email: string;
  status: string;
  value_cents: number;
  proposal_version: number;
  service_type: string;
};
const initial: ContractTerms = {
  proposalId: '',
  proposalVersion: 1,
  serviceType: 'site_landing',
  timeline: '',
  deliverables: '',
  outOfScope:
    'Novas funcionalidades, alterações de escopo e serviços não descritos nesta proposta.',
  paymentTerms: '',
  revisionsIncluded: 2,
  extraRevisionCents: 0,
  upfrontCents: 0,
  installments: 1,
  paymentDay: 10,
  latePenaltyPercent: 2,
  monthlyInterestPercent: 1,
  adjustmentIndex: 'IPCA',
  hostingPayer: 'client',
  domainPayer: 'client',
  toolsPayer: 'client',
  warrantyDays: 90,
  supportResponseHours: 8,
  noticeDays: 30,
};
export function ServiceContracts({
  user,
  leads,
}: {
  user: AuthenticatedSession;
  leads: WorkspaceLead[];
}) {
  const request = useCrmApi(user),
    proposals = useModule('contract', user),
    [tab, setTab] = useState('proposals'),
    [agreements, setAgreements] = useState<Agreement[]>([]),
    [terms, setTerms] = useState<ContractTerms>(initial),
    [preview, setPreview] = useState<ContractDocument>(),
    [url, setUrl] = useState(''),
    [to, setTo] = useState(''),
    [deliveries, setDeliveries] = useState<
      { id: string; channel: string; recipient: string; status: string }[]
    >([]),
    [name, setName] = useState(user.fullName),
    [document, setDocument] = useState(''),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    if (user.preview) return;
    try {
      setAgreements((await request('/api/v1/service-contracts')).items);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [request, user.preview]);
  useEffect(() => {
    void load();
  }, [load]);
  const eligible = proposals.items.filter((p) =>
      ['accepted', 'active'].includes((p.data as ContractData).status),
    ),
    selected = eligible.find((p) => p.id === terms.proposalId);
  const view = async (id: string) => {
    setError('');
    setUrl('');
    setAccepted(false);
    setDocument('');
    try {
      const [doc, history] = await Promise.all([
        request(`/api/v1/service-contracts/${id}`),
        request(`/api/v1/service-contracts/${id}/deliveries`),
      ]);
      setPreview(doc);
      setDeliveries(history.items);
      setTo(agreements.find((a) => a.id === id)?.client_email ?? '');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const generate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const parsed = ContractGenerationInput.safeParse(terms);
      if (!parsed.success) throw Error(parsed.error.issues[0]?.message ?? 'Confira as condições.');
      const result = await request('/api/v1/service-contracts', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      await load();
      await view(result.id);
      setNotice('Documento gerado. Revise antes de compartilhar ou assinar.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      const data = await request(`/api/v1/service-contracts/${preview.id}/link`, {
        method: 'POST',
      });
      setUrl(data.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const send = async (channel: 'email' | 'whatsapp') => {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      await request(`/api/v1/service-contracts/${preview.id}/deliveries`, {
        method: 'POST',
        body: JSON.stringify({
          channel,
          to: channel === 'email' ? to : undefined,
          requestId: crypto.randomUUID(),
        }),
      });
      setDeliveries((await request(`/api/v1/service-contracts/${preview.id}/deliveries`)).items);
      setNotice('Envio registrado. Acompanhe a confirmação no histórico.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sign = async (event: FormEvent) => {
    event.preventDefault();
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      await request(`/api/v1/service-contracts/${preview.id}/sign`, {
        method: 'POST',
        body: JSON.stringify({ name, document, documentHash: preview.documentHash, accepted }),
      });
      await load();
      await view(preview.id);
      setNotice('Aceite da contratada registrado.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const numberFields = [
    ['revisionsIncluded', 'Rodadas de revisão incluídas'],
    ['latePenaltyPercent', 'Multa por atraso (%)'],
    ['monthlyInterestPercent', 'Juros mensais (%)'],
    ['warrantyDays', 'Garantia de correção (dias)'],
    ['supportResponseHours', 'Meta de resposta do suporte (horas úteis)'],
    ['noticeDays', 'Aviso prévio (dias)'],
  ] as const;
  const update = () => Boolean(resolveGrantedScope(user.roles, 'contract:update'));
  return (
    <div className="module-workspace">
      <div className="module-tabs">
        <button aria-pressed={tab === 'proposals'} onClick={() => setTab('proposals')}>
          Propostas versionadas
        </button>
        <button
          aria-pressed={tab === 'contracts'}
          onClick={() => {
            setTab('contracts');
            proposals.reload();
            void load();
          }}
        >
          Contratos de serviços
        </button>
      </div>
      {tab === 'proposals' ? (
        <RecordsModule kind="contract" user={user} leads={leads} />
      ) : (
        <>
          <Card>
            <h3>
              <FileSignature size={22} />
              Da proposta aceita ao contrato.
            </h3>
            <p>
              As partes, o escopo e o valor vêm da proposta. A identidade da contratada vem de
              Configurações.
            </p>
            <details open={!agreements.length} className="contract-generator">
              <summary>Gerar contrato para revisar</summary>
              <form onSubmit={(event) => void generate(event)}>
                <label>
                  Proposta aceita
                  <select
                    required
                    value={terms.proposalId}
                    onChange={(e) => {
                      const p = eligible.find((p) => p.id === e.target.value),
                        data = p?.data as ContractData | undefined;
                      setTerms({
                        ...initial,
                        proposalId: p?.id ?? '',
                        proposalVersion: p?.version ?? 1,
                        serviceType: data?.serviceType ?? 'site_landing',
                        deliverables: data?.scope.slice(0, 5000) ?? '',
                        paymentTerms: data?.terms.slice(0, 3000) ?? '',
                        upfrontCents: data?.upfrontCents ?? 0,
                        installments: data?.installments ?? 1,
                        paymentDay: data?.paymentDay ?? 10,
                      });
                    }}
                  >
                    <option value="">Escolha uma proposta</option>
                    {eligible.map((p) => (
                      <option key={p.id} value={p.id}>
                        {(p.data as ContractData).title} · v{p.version} ·{' '}
                        {money((p.data as ContractData).valueCents)}
                      </option>
                    ))}
                  </select>
                </label>
                {!eligible.length && (
                  <p>
                    Registre o aceite e o vínculo do contato na proposta para gerar seu contrato.
                  </p>
                )}
                {selected && (
                  <p className="contract-source">
                    Versão {terms.proposalVersion} · {statusLabel[terms.serviceType]} · Valor
                    aceito: {money((selected.data as ContractData).valueCents)} ·{' '}
                    {money(terms.upfrontCents)} de entrada / {terms.installments} parcela(s) do
                    saldo.
                  </p>
                )}
                <label>
                  Modelo de serviço
                  <select
                    value={terms.serviceType}
                    disabled
                    onChange={(e) =>
                      setTerms((current) => ({
                        ...current,
                        serviceType: e.target.value as ContractTerms['serviceType'],
                      }))
                    }
                  >
                    {['site_landing', 'system_app', 'paid_marketing', 'maintenance'].map((type) => (
                      <option key={type} value={type}>
                        {statusLabel[type]}
                      </option>
                    ))}
                  </select>
                </label>
                {[
                  ['timeline', 'Etapas e cronograma combinado'],
                  ['deliverables', 'Entregáveis incluídos'],
                  ['outOfScope', 'O que está fora do escopo'],
                  ['paymentTerms', 'Condições de pagamento aceitas'],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <textarea
                      required
                      rows={3}
                      maxLength={key === 'paymentTerms' ? 3000 : 5000}
                      value={String(terms[key as keyof ContractTerms])}
                      onChange={(e) =>
                        setTerms((current) => ({ ...current, [key!]: e.target.value }))
                      }
                    />
                  </label>
                ))}
                <details>
                  <summary>Revisões, terceiros, garantia e suporte</summary>
                  <div className="contract-terms-grid">
                    {numberFields.map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <input
                          type="number"
                          required
                          min={0}
                          max={key === 'warrantyDays' ? 365 : undefined}
                          step={key.includes('Percent') ? '0.1' : '1'}
                          value={terms[key]}
                          onChange={(e) =>
                            setTerms((current) => ({ ...current, [key]: Number(e.target.value) }))
                          }
                        />
                      </label>
                    ))}
                    <label>
                      Valor por revisão extra (R$, zero: orçar previamente)
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={terms.extraRevisionCents / 100}
                        onChange={(e) =>
                          setTerms((current) => ({
                            ...current,
                            extraRevisionCents: Math.round(Number(e.target.value) * 100),
                          }))
                        }
                      />
                    </label>
                    <label>
                      Reajuste anual
                      <select
                        value={terms.adjustmentIndex}
                        onChange={(e) =>
                          setTerms((current) => ({
                            ...current,
                            adjustmentIndex: e.target.value as ContractTerms['adjustmentIndex'],
                          }))
                        }
                      >
                        {['IPCA', 'IGP-M', 'sem reajuste'].map((index) => (
                          <option key={index}>{index}</option>
                        ))}
                      </select>
                    </label>
                    {[
                      ['hostingPayer', 'Quem paga a hospedagem'],
                      ['domainPayer', 'Quem paga o domínio'],
                      ['toolsPayer', 'Quem paga ferramentas de terceiros'],
                    ].map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <select
                          value={String(terms[key as keyof ContractTerms])}
                          onChange={(e) =>
                            setTerms((current) => ({ ...current, [key!]: e.target.value }))
                          }
                        >
                          <option value="client">Cliente</option>
                          <option value="provider">Contratada, quando incluído no preço</option>
                        </select>
                      </label>
                    ))}
                  </div>
                </details>
                <p className="module-footnote">
                  Todo documento recebe a marca “modelo, revisar com advogado”.
                </p>
                <Button
                  disabled={
                    busy || !selected || !resolveGrantedScope(user.roles, 'contract:create')
                  }
                >
                  Gerar documento para revisar
                </Button>
              </form>
            </details>
          </Card>
          <div className="service-contract-list">
            {agreements.map((item) => (
              <Card key={item.id}>
                <span className="module-eyebrow">
                  {statusLabel[item.service_type] ?? item.service_type}
                </span>
                <h3>{item.title}</h3>
                <p>
                  {item.client_name} · proposta v{item.proposal_version}
                </p>
                <strong>{money(Number(item.value_cents))}</strong>
                <p>
                  {{
                    issued: 'Aguardando aceite',
                    client_signed: 'Cliente assinou',
                    signed: 'Ambas as partes assinaram',
                    cancelled: 'Cancelado',
                  }[item.status] ?? item.status}
                </p>
                <Button variant="outline" onClick={() => void view(item.id)}>
                  Abrir documento e evidências
                </Button>
              </Card>
            ))}
          </div>
          {!agreements.length && (
            <p>Nenhum contrato gerado. Suas propostas continuam na aba ao lado.</p>
          )}
          {preview && (
            <Card className="contract-review">
              <header>
                <h3>{preview.title}</h3>
                <button
                  className="icon-button"
                  aria-label="Fechar documento"
                  onClick={() => setPreview(undefined)}
                >
                  <X />
                </button>
              </header>
              <div className="module-actions no-print">
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer size={16} />
                  Imprimir / PDF
                </Button>
                <Button variant="outline" disabled={busy || !update()} onClick={() => void share()}>
                  <LinkIcon size={16} />
                  Obter link de assinatura
                </Button>
              </div>
              {url && (
                <p className="contract-share-url no-print">
                  <a href={url} target="_blank" rel="noreferrer">
                    Abrir link individual ↗
                  </a>
                  <input
                    readOnly
                    aria-label="Link de assinatura"
                    value={url}
                    onFocus={(e) => e.target.select()}
                  />
                </p>
              )}
              <ContractPaper document={preview} />
              {update() && (
                <section className="contract-delivery no-print">
                  <h3>Enviar convite</h3>
                  <label>
                    E-mail do destinatário
                    <input type="email" value={to} onChange={(e) => setTo(e.target.value)} />
                  </label>
                  <div className="module-actions">
                    <Button
                      variant="outline"
                      disabled={busy || !to}
                      onClick={() => void send('email')}
                    >
                      <Mail size={16} />
                      Enviar por e-mail
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy || !resolveGrantedScope(user.roles, 'whatsapp:create')}
                      onClick={() => void send('whatsapp')}
                    >
                      <MessageSquare size={16} />
                      Enviar no WhatsApp
                    </Button>
                  </div>
                  {deliveries.map((d) => (
                    <p key={d.id}>
                      {d.channel === 'email' ? 'E-mail' : 'WhatsApp'} · {d.recipient} ·{' '}
                      {{
                        smtp_accepted: 'Aceito pelo servidor de e-mail',
                        queued: 'Na fila',
                        sent: 'Enviado',
                        delivered: 'Entregue',
                        read: 'Lido',
                        failed: 'Falhou',
                      }[d.status] ?? d.status}
                    </p>
                  ))}
                </section>
              )}
              {resolveGrantedScope(user.roles, 'contract:approve') &&
                !preview.signatures.some((s) => s.party === 'provider') &&
                preview.status !== 'cancelled' && (
                  <details className="no-print">
                    <summary>Registrar aceite da contratada</summary>
                    <form onSubmit={(event) => void sign(event)}>
                      <label>
                        Nome do representante que assina
                        <input required value={name} onChange={(e) => setName(e.target.value)} />
                      </label>
                      <label>
                        CPF ou CNPJ da contratada
                        <input
                          required
                          value={document}
                          onChange={(e) => setDocument(e.target.value)}
                        />
                      </label>
                      <label className="signature-consent">
                        <input
                          type="checkbox"
                          required
                          checked={accepted}
                          onChange={(e) => setAccepted(e.target.checked)}
                        />
                        Li o documento e declaro ter poderes para representar a contratada.
                      </label>
                      <Button disabled={busy || !accepted}>Registrar aceite da contratada</Button>
                    </form>
                  </details>
                )}
            </Card>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
