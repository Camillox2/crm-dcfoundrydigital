import { useEffect, useState, type FormEvent } from 'react';
import { Building2, Check, ShieldCheck } from 'lucide-react';
import { Button, Card } from '@dcfoundry/ui';
import { CompanyInput } from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi } from './useModule.js';
export function CompanySettings({ user }: { user: AuthenticatedSession }) {
  const request = useCrmApi(user),
    [value, setValue] = useState({
      name: '',
      document: '',
      address: '',
      email: '',
      phone: '',
      representative: '',
      version: 0,
    }),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    if (user.preview) return;
    let active = true;
    request('/api/v1/settings/company')
      .then((data) => {
        if (active && data.item) setValue(data.item);
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, [request, user.preview]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const parsed = CompanyInput.safeParse(value);
      if (!parsed.success) throw Error(parsed.error.issues[0]?.message ?? 'Confira os dados.');
      const result = await request('/api/v1/settings/company', {
        method: 'PUT',
        body: JSON.stringify(parsed.data),
      });
      setValue(result.item);
      setNotice('Identidade salva para os próximos documentos.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const fields = [
    ['name', 'Nome da contratada / nome completo'],
    ['document', 'Documento — CPF ou CNPJ'],
    ['address', 'Endereço completo'],
    ['email', 'E-mail de contato'],
    ['phone', 'Telefone com DDI'],
    ['representative', 'Representante'],
  ] as const;
  return (
    <div className="company-settings-layout">
      <Card>
        <h3>
          <Building2 size={22} />
          Identidade da contratada
        </h3>
        <p>Use seu CPF enquanto atuar como pessoa física. Você pode trocar para CNPJ depois.</p>
        <form onSubmit={(event) => void save(event)} className="company-settings-form">
          {fields.map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                required
                type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
                value={value[key]}
                maxLength={key === 'address' ? 1000 : 254}
                autoCapitalize={key === 'document' ? 'characters' : undefined}
                placeholder={key === 'phone' ? '+5541999999999' : undefined}
                onChange={(e) => setValue((current) => ({ ...current, [key]: e.target.value }))}
              />
            </label>
          ))}
          {error && <p role="alert">{error}</p>}
          {notice && (
            <p role="status">
              <Check size={16} />
              {notice}
            </p>
          )}
          <Button type="submit" disabled={busy || user.preview}>
            {busy ? 'Salvando…' : 'Salvar identidade'}
          </Button>
        </form>
      </Card>
      <Card tone="navy">
        <ShieldCheck size={30} />
        <h3>Dados que acompanham sua empresa.</h3>
        <p>
          Novos contratos usam o cadastro salvo aqui. Documentos já gerados mantêm as partes e as
          condições da versão assinada.
        </p>
        <p>
          O documento aceita CPF e CNPJ, inclusive o formato alfanumérico. Nenhuma etapa exige CNPJ
          para pessoa física.
        </p>
      </Card>
    </div>
  );
}
