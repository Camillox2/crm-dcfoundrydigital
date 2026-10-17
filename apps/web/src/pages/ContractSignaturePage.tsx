import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, FileSignature, Printer, ShieldCheck } from 'lucide-react';
import { Button, DcLogo } from '@dcfoundry/ui';
export type ContractDocument = {
  id: string;
  title: string;
  status: string;
  documentHash: string;
  text: string;
  signatures: {
    party: string;
    signer_name: string;
    signed_at: string;
    document_hash: string;
    evidence_hash: string;
    ip_address?: string;
  }[];
};
export function ContractPaper({ document }: { document: ContractDocument }) {
  return (
    <article className="contract-document">
      <pre>{document.text}</pre>
      <section className="contract-evidence">
        <h2>Evidências de assinatura</h2>
        <p>
          SHA-256 do documento: <code>{document.documentHash}</code>
        </p>
        {document.signatures.length ? (
          document.signatures.map((s, index) => (
            <div key={index}>
              <strong>
                {s.party === 'client' ? 'Contratante' : 'Contratada'} · {s.signer_name}
              </strong>
              <p>
                {new Date(s.signed_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
              </p>
              <small>Hash da evidência: {s.evidence_hash}</small>
              {s.ip_address && <small>IP: {s.ip_address}</small>}
            </div>
          ))
        ) : (
          <p>Aguardando assinaturas.</p>
        )}
      </section>
    </article>
  );
}
export function ContractSignaturePage({ token }: { token: string }) {
  const [document, setDocument] = useState<ContractDocument>(),
    [name, setName] = useState(''),
    [identity, setIdentity] = useState(''),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/public/service-contracts/${encodeURIComponent(token)}`, {
          cache: 'no-store',
        }),
        body = await response.json();
      if (!response.ok) throw Error(body.message ?? 'Link indisponível ou expirado.');
      setDocument(body);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  const signed = document?.signatures.some((s) => s.party === 'client');
  const sign = async (event: FormEvent) => {
    event.preventDefault();
    if (!document) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
          `/api/public/service-contracts/${encodeURIComponent(token)}/sign`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              document: identity,
              documentHash: document.documentHash,
              accepted,
            }),
          },
        ),
        result = await response.json();
      if (!response.ok) throw Error(result.message ?? 'Não foi possível registrar o aceite.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="public-contract">
      <header className="public-contract-header no-print">
        <DcLogo size={42} />
        <span>
          <FileSignature size={18} />
          Conferência e assinatura
        </span>
      </header>
      <div className="public-contract-grid">
        {document ? (
          <>
            <ContractPaper document={document} />
            <aside className="contract-signing-card no-print">
              <ShieldCheck size={32} />
              <h1>Confira cada detalhe.</h1>
              <p>
                O documento é um modelo para revisão. Leia o escopo e as condições antes do aceite.
              </p>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer size={16} />
                Imprimir / salvar PDF
              </Button>
              {signed ? (
                <div role="status">
                  <CheckCircle2 size={26} />
                  <h2>Seu aceite foi registrado.</h2>
                  <p>As evidências estão no final do documento.</p>
                </div>
              ) : document.status === 'cancelled' ? (
                <p role="alert">Este contrato foi cancelado.</p>
              ) : (
                <form onSubmit={(event) => void sign(event)}>
                  <label>
                    Nome completo do signatário
                    <input
                      required
                      value={name}
                      maxLength={180}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                    />
                  </label>
                  <label>
                    CPF ou CNPJ da parte contratante
                    <input
                      required
                      value={identity}
                      maxLength={24}
                      onChange={(e) => setIdentity(e.target.value)}
                      autoCapitalize="characters"
                    />
                  </label>
                  <label className="signature-consent">
                    <input
                      type="checkbox"
                      required
                      checked={accepted}
                      onChange={(e) => setAccepted(e.target.checked)}
                    />
                    Li e concordo com o documento apresentado e declaro ter poderes para representar
                    a parte contratante.
                  </label>
                  <p className="module-footnote">
                    O aceite registra nome, data, hora, IP e o hash desta versão.
                  </p>
                  <Button type="submit" disabled={busy || !accepted}>
                    {busy ? 'Registrando…' : 'Registrar meu aceite'}
                  </Button>
                </form>
              )}
              {error && <p role="alert">{error}</p>}
            </aside>
          </>
        ) : (
          <section className="contract-signing-card">
            <h1>{error ? 'Link indisponível' : 'Carregando documento…'}</h1>
            {error && <p role="alert">{error}</p>}
          </section>
        )}
      </div>
    </main>
  );
}
