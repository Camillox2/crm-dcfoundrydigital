import { useCallback, useEffect, useState } from 'react';
import { Paperclip, Tags, Download } from 'lucide-react';
import { Button } from '@dcfoundry/ui';
import { resolveGrantedScope } from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi } from './useModule.js';
export function LeadExtras({ user, leadId }: { user: AuthenticatedSession; leadId: string }) {
  const request = useCrmApi(user),
    [tags, setTags] = useState<{ id: string; name: string; color: string }[]>([]),
    [files, setFiles] = useState<
      { id: string; file_name: string; bytes: number; created_at: string }[]
    >([]),
    [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    if (user.preview) return;
    try {
      const data = await request(`/api/v1/leads/${leadId}/extras`);
      setTags(data.tags);
      setText(data.tags.map((t: { name: string }) => t.name).join(', '));
      setFiles(data.attachments);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [user.preview, leadId, request]);
  useEffect(() => {
    void load();
  }, [load]);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await request(`/api/v1/leads/${leadId}/tags`, {
        method: 'PUT',
        body: JSON.stringify({
          tags: [
            ...new Set(
              text
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            ),
          ].map((name) => ({ name, color: tags.find((t) => t.name === name)?.color ?? '#246ba5' })),
        }),
      });
      await load();
      window.dispatchEvent(new Event('crm:leads-changed'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      if (file.size > 16 * 1024 * 1024) throw Error('Use um arquivo de até 16 MB.');
      const base64 = await new Promise<string>((done, reject) => {
        const reader = new FileReader();
        reader.onload = () => done(String(reader.result).split(',')[1] ?? '');
        reader.onerror = () => reject(Error('Não foi possível ler o arquivo.'));
        reader.readAsDataURL(file);
      });
      await request(`/api/v1/leads/${leadId}/attachments`, {
        method: 'POST',
        body: JSON.stringify({
          name: file.name,
          mime: file.type || 'application/octet-stream',
          base64,
        }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const download = async (id: string, name: string) => {
    setError('');
    try {
      const response = await fetch(`/api/v1/leads/${leadId}/attachments/${id}`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      if (!response.ok) throw Error('Anexo indisponível.');
      const url = URL.createObjectURL(await response.blob()),
        link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="lead-extras">
      <h3>
        <Tags size={18} />
        Tags do contato
      </h3>
      <div className="lead-tag-list">
        {tags.map((tag) => (
          <span key={tag.id} style={{ borderColor: tag.color }}>
            {tag.name}
          </span>
        ))}
      </div>
      <label>
        Tags separadas por vírgula
        <input
          value={text}
          maxLength={600}
          onChange={(e) => setText(e.target.value)}
          placeholder="Site, SEO, Prioridade"
        />
      </label>
      <Button
        variant="outline"
        disabled={busy || !resolveGrantedScope(user.roles, 'lead:update')}
        onClick={() => void save()}
      >
        Salvar tags
      </Button>
      <h3>
        <Paperclip size={18} />
        Anexos do lead
      </h3>
      <p>Briefing, referências, materiais e arquivos de até 16 MB.</p>
      {files.map((file) => (
        <button
          className="lead-file"
          key={file.id}
          onClick={() => void download(file.id, file.file_name)}
        >
          <Download size={16} />
          <span>
            {file.file_name}
            <small>{Math.ceil(file.bytes / 1024)} KB</small>
          </span>
        </button>
      ))}
      {!files.length && <p>Nenhum anexo ainda.</p>}
      <label className="wa-attachment">
        <Paperclip size={16} />
        {busy ? 'Enviando…' : 'Adicionar arquivo'}
        <input
          type="file"
          disabled={busy || !resolveGrantedScope(user.roles, 'lead:update')}
          onChange={(e) => {
            if (e.target.files?.[0]) void upload(e.target.files[0]);
            e.target.value = '';
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
