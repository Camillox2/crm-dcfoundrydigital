import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Check,
  Copy,
  ExternalLink,
  Eye,
  History,
  ImagePlus,
  Save,
  Send,
} from 'lucide-react';
import { Badge, Button, Card } from '@dcfoundry/ui';
import {
  BlogInput,
  slugify,
  markdownHtml,
  type BlogData,
  type WorkspaceDocument,
} from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useModule, downloadCsv } from './useModule.js';
import {
  ModuleToolbar,
  ModuleEmpty,
  ModuleNotice,
  Pagination,
  ModuleDialog,
  RecordHistory,
  statusLabel,
  flattenRecord,
  useUnsavedChanges,
} from './ModuleTools.js';

const initial: BlogData = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  coverUrl: '',
  coverAlt: '',
  author: 'DC Foundry Digital',
  category: 'Tecnologia',
  tags: [],
  seoTitle: '',
  seoDescription: '',
  status: 'draft',
  scheduledAt: '',
};
const localTime = (v: string) =>
  v
    ? new Date(Date.parse(v) - new Date(v).getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    : '';
export function BlogStudio({ user }: { user: AuthenticatedSession }) {
  const module = useModule('blog', user);
  const [editing, setEditing] = useState<WorkspaceDocument | null | undefined>(),
    [data, setData] = useState<BlogData>(initial),
    [saved, setSaved] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [preview, setPreview] = useState(false),
    [history, setHistory] = useState<{ version: number; data: unknown; savedAt: string }[] | null>(
      null,
    ),
    [notice, setNotice] = useState('');
  const content = useRef<HTMLTextAreaElement>(null);
  const [tagsText, setTagsText] = useState('');
  const recoveryKey = `dcf-blog-recovery-${user.userId}`;
  const [recovery, setRecovery] = useState<{
    data: BlogData;
    record: WorkspaceDocument | null;
  } | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(recoveryKey) ?? 'null');
    } catch {
      return null;
    }
  });
  const dirty = editing !== undefined && JSON.stringify(data) !== saved;
  useEffect(() => {
    if (editing === undefined) return;
    try {
      if (dirty) sessionStorage.setItem(recoveryKey, JSON.stringify({ data, record: editing }));
      else sessionStorage.removeItem(recoveryKey);
    } catch {}
  }, [editing, data, dirty, recoveryKey]);
  useUnsavedChanges(dirty);
  const begin = (record?: WorkspaceDocument) => {
    document.getElementById('workspace-main')?.scrollTo({ top: 0 });
    let next = record ? (record.data as BlogData) : { ...initial };
    if (next.status === 'scheduled' && Date.parse(next.scheduledAt) <= Date.now())
      next = { ...next, status: 'published', scheduledAt: '' };
    setEditing(record ?? null);
    setData(next);
    setTagsText(next.tags.join(', '));
    setSaved(JSON.stringify(next));
    setError('');
    setNotice('');
    setPreview(false);
    setRecovery(null);
  };
  const close = () => {
    if (!dirty || window.confirm('Sair do editor sem salvar as alterações?')) {
      setEditing(undefined);
      setHistory(null);
      try {
        sessionStorage.removeItem(recoveryKey);
      } catch {}
    }
  };
  const change = <K extends keyof BlogData>(key: K, value: BlogData[K]) =>
    setData((current) => ({ ...current, [key]: value }));
  const save = async (status: BlogData['status']) => {
    const input = {
      ...data,
      tags: tagsText
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
      status,
      slug: data.slug || slugify(data.title),
    };
    const parsed = BlogInput.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confira os campos.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const item = await module.save(parsed.data, editing ?? undefined);
      setEditing(item);
      setData(item.data as BlogData);
      setSaved(JSON.stringify(item.data));
      setNotice(
        status === 'published'
          ? 'Artigo publicado no feed do CRM. A atualização do site segue o estado de sincronização.'
          : status === 'scheduled'
            ? 'Publicação agendada. O artigo entra no feed na data escolhida.'
            : 'Rascunho salvo.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const insert = (before: string, after = '') => {
    const el = content.current;
    if (!el) return;
    const start = el.selectionStart,
      end = el.selectionEnd;
    change(
      'content',
      data.content.slice(0, start) +
        before +
        data.content.slice(start, end) +
        after +
        data.content.slice(end),
    );
    el.focus();
  };
  const upload = async (file: File) => {
    if (!/image\/(png|jpeg|webp)/.test(file.type) || file.size > 2_000_000) {
      setError('Use PNG, JPG ou WebP com até 2 MB.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await module.request('/api/v1/media', {
        method: 'POST',
        body: JSON.stringify({ image: base64 }),
      });
      change('coverUrl', result.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (editing !== undefined)
    return (
      <div className="blog-studio" data-blog-editor>
        <header className="editor-heading">
          <button className="text-button" onClick={close}>
            <ArrowLeft size={16} />
            Todos os artigos
          </button>
          <span>
            {dirty
              ? 'Alterações não salvas'
              : editing
                ? 'Todas as alterações salvas'
                : 'Novo rascunho'}
          </span>
          <div>
            <Button size="sm" disabled={busy} onClick={() => void save(data.status)}>
              <Save size={15} />
              {busy ? 'Salvando...' : 'Salvar'}
            </Button>
            <button
              className="module-filter"
              aria-pressed={preview}
              onClick={() => setPreview((v) => !v)}
            >
              <Eye size={16} />
              {preview ? 'Editar' : 'Prévia'}
            </button>
            {editing && (
              <button
                className="module-filter"
                onClick={() => {
                  void module
                    .request(`/api/v1/workspace/blog/${editing.id}/versions`)
                    .then((r) => setHistory(r.items))
                    .catch((e) => setError(e.message));
                }}
              >
                <History size={16} />
                Versões
              </button>
            )}
          </div>
        </header>
        {error && <ModuleNotice error>{error}</ModuleNotice>}
        {notice && <ModuleNotice>{notice}</ModuleNotice>}
        <div className="blog-editor-grid">
          <Card className="blog-editor-main">
            {preview ? (
              <article className="blog-article-preview">
                {data.coverUrl && <img src={data.coverUrl} alt={data.coverAlt} />}
                <small>
                  {data.category} · {data.author}
                </small>
                <h1>{data.title || 'Título do artigo'}</h1>
                <p className="article-excerpt">{data.excerpt}</p>
                <div dangerouslySetInnerHTML={{ __html: markdownHtml(data.content) }} />
              </article>
            ) : (
              <>
                <label className="editor-title-label">
                  Título do artigo
                  <input
                    className="editor-title"
                    placeholder="Uma ideia que merece ser compartilhada..."
                    maxLength={180}
                    value={data.title}
                    onChange={(e) =>
                      setData((v) => ({
                        ...v,
                        title: e.target.value,
                        slug: editing?.publishedAt ? v.slug : slugify(e.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  Resumo
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={data.excerpt}
                    onChange={(e) => change('excerpt', e.target.value)}
                    placeholder="O que o leitor vai descobrir?"
                  />
                </label>
                <div className="editor-formatting" aria-label="Formatação do artigo">
                  <button type="button" onClick={() => insert('\n\n## ')}>
                    Título
                  </button>
                  <button type="button" onClick={() => insert('**', '**')}>
                    <strong>Negrito</strong>
                  </button>
                  <button type="button" onClick={() => insert('\n- ')}>
                    Lista
                  </button>
                  <button type="button" onClick={() => insert('[', '](https://exemplo.com)')}>
                    Link
                  </button>
                  <span>Markdown simples · HTML não é executado</span>
                </div>
                <label>
                  Conteúdo
                  <textarea
                    ref={content}
                    className="editor-content"
                    rows={18}
                    value={data.content}
                    onChange={(e) => change('content', e.target.value)}
                    placeholder="Comece a escrever. Use ## para títulos, **negrito** e - para listas."
                  />
                </label>
                <footer className="editor-word-count">
                  {data.content.trim() ? data.content.trim().split(/\s+/).length : 0} palavras ·{' '}
                  {Math.max(1, Math.ceil(data.content.trim().split(/\s+/).length / 200))} min de
                  leitura
                </footer>
              </>
            )}
          </Card>
          <aside className="blog-editor-aside">
            <Card>
              <h3>Publicação</h3>
              <Badge tone="sky">{statusLabel[data.status]}</Badge>
              <label>
                Autor
                <input value={data.author} onChange={(e) => change('author', e.target.value)} />
              </label>
              <label>
                Categoria
                <input value={data.category} onChange={(e) => change('category', e.target.value)} />
              </label>
              <label>
                Tags, separadas por vírgula
                <input
                  value={tagsText}
                  onChange={(e) => {
                    setTagsText(e.target.value);
                    change(
                      'tags',
                      e.target.value
                        .split(',')
                        .map((v) => v.trim())
                        .filter(Boolean)
                        .slice(0, 12),
                    );
                  }}
                />
              </label>
              <label>
                Agendar para
                <input
                  type="datetime-local"
                  value={localTime(data.scheduledAt)}
                  onChange={(e) =>
                    change(
                      'scheduledAt',
                      e.target.value ? new Date(e.target.value).toISOString() : '',
                    )
                  }
                />
              </label>
              <div className="editor-publish-actions">
                <Button disabled={busy} variant="outline" onClick={() => void save('draft')}>
                  <Save size={15} />
                  Salvar rascunho
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void save(data.scheduledAt ? 'scheduled' : 'published')}
                >
                  {data.scheduledAt ? <Calendar size={15} /> : <Send size={15} />}{' '}
                  {busy ? 'Salvando...' : data.scheduledAt ? 'Agendar artigo' : 'Publicar artigo'}
                </Button>
              </div>
              {editing && (
                <small>
                  Sincronização: {statusLabel[editing.syncStatus] ?? editing.syncStatus}. Publicação
                  não garante indexação pelos buscadores.
                </small>
              )}
            </Card>
            <Card>
              <h3>Capa do artigo</h3>
              {data.coverUrl && (
                <img className="editor-cover" src={data.coverUrl} alt={data.coverAlt} />
              )}
              <label className="upload-cover">
                <ImagePlus size={18} />
                Enviar imagem
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file);
                  }}
                />
              </label>
              <label>
                Ou URL HTTPS
                <input
                  value={data.coverUrl}
                  onChange={(e) => change('coverUrl', e.target.value)}
                  placeholder="https://..."
                />
              </label>
              <label>
                Descrição da imagem
                <input
                  value={data.coverAlt}
                  onChange={(e) => change('coverAlt', e.target.value)}
                  placeholder="Descreva a capa para quem não a vê"
                />
              </label>
            </Card>
            <Card>
              <h3>Busca & compartilhamento</h3>
              <label>
                URL do artigo
                <input
                  value={data.slug}
                  disabled={Boolean(editing?.publishedAt)}
                  onChange={(e) => change('slug', slugify(e.target.value))}
                />
              </label>
              <small>/blog/{data.slug || 'titulo-do-artigo'}</small>
              <label>
                Título SEO ({data.seoTitle.length}/70)
                <input
                  maxLength={70}
                  value={data.seoTitle}
                  onChange={(e) => change('seoTitle', e.target.value)}
                />
              </label>
              <label>
                Descrição SEO ({data.seoDescription.length}/180)
                <textarea
                  rows={3}
                  maxLength={180}
                  value={data.seoDescription}
                  onChange={(e) => change('seoDescription', e.target.value)}
                />
              </label>
              <div className="seo-preview">
                <strong>{data.seoTitle || data.title || 'Título da página'}</strong>
                <span>dcfoundrydigital.com/blog/{data.slug}</span>
                <p>
                  {data.seoDescription ||
                    data.excerpt ||
                    'Uma descrição clara ajuda o leitor a escolher o seu conteúdo.'}
                </p>
              </div>
            </Card>
          </aside>
        </div>
        {history && (
          <ModuleDialog title="Histórico do artigo" onClose={() => setHistory(null)}>
            <RecordHistory
              items={history}
              onRestore={(value) => {
                setData(value as BlogData);
                setHistory(null);
                setNotice('Versão carregada. Confira e salve para restaurar.');
              }}
            />
          </ModuleDialog>
        )}
      </div>
    );
  const posts = module.items as WorkspaceDocument<BlogData>[];
  return (
    <div className="module-workspace">
      {recovery && (
        <ModuleNotice>
          Há um texto não salvo nesta aba.{' '}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              begin(recovery.record ?? undefined);
              setData(recovery.data);
              setTagsText(recovery.data.tags.join(', '));
              setRecovery(null);
            }}
          >
            Continuar edição
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setRecovery(null);
              try {
                sessionStorage.removeItem(recoveryKey);
              } catch {}
            }}
          >
            Descartar texto local
          </button>
        </ModuleNotice>
      )}
      <ModuleToolbar
        query={module.query}
        onQuery={module.setQuery}
        archived={module.archived}
        onArchived={module.setArchived}
        label="Novo artigo"
        onCreate={() => begin()}
        onRefresh={module.reload}
        onExport={() => downloadCsv('artigos.csv', module.items.map(flattenRecord))}
      />
      <div className="module-context-strip">
        <BookOpen size={17} />
        <span>Escreva, revise e publique. O feed público é atualizado pelo próprio CRM.</span>
        <button
          className="text-button"
          onClick={() => {
            void module
              .request('/api/v1/workspace/blog-sync', { method: 'POST' })
              .then((r) =>
                setNotice(
                  r.status === 'not_configured'
                    ? 'Configure a conexão com o site no VPS. Os artigos já ficam disponíveis no feed público do CRM.'
                    : `${r.delivered} atualizações entregues ao site.`,
                ),
              )
              .catch((e) => setError(e.message));
          }}
        >
          Sincronizar site
        </button>
      </div>
      {(error || module.error) && <ModuleNotice error>{error || module.error}</ModuleNotice>}
      {notice && <ModuleNotice>{notice}</ModuleNotice>}
      {module.loading ? (
        <p role="status">Carregando artigos...</p>
      ) : !posts.length ? (
        <ModuleEmpty
          title={module.archived ? 'Nenhum artigo arquivado.' : 'Seu próximo conteúdo começa aqui.'}
          text="Crie um artigo, salve como rascunho e confira a prévia antes de publicar."
          action="Criar meu primeiro artigo"
          onAction={() => begin()}
        />
      ) : (
        <div className="blog-post-grid">
          {posts.map((post) => (
            <Card key={post.id} className="blog-post-card">
              {post.data.coverUrl ? (
                <img src={post.data.coverUrl} alt={post.data.coverAlt} />
              ) : (
                <div className="blog-cover-placeholder">
                  <BookOpen size={40} />
                  <span>{post.data.category}</span>
                </div>
              )}
              <div>
                <div className="blog-card-meta">
                  <Badge tone="sky">{statusLabel[post.data.status]}</Badge>
                  <span>{new Date(post.updatedAt).toLocaleDateString('pt-BR')}</span>
                </div>
                <h3>{post.data.title}</h3>
                <p>{post.data.excerpt || 'Sem resumo.'}</p>
                <small>
                  {post.data.author} · {statusLabel[post.syncStatus] ?? post.syncStatus}
                </small>
                <div className="record-actions">
                  <Button size="sm" onClick={() => begin(post)}>
                    Editar artigo
                  </Button>
                  <button
                    aria-label={`Duplicar ${post.data.title}`}
                    className="icon-button"
                    onClick={() => {
                      const copy = {
                        ...post,
                        data: {
                          ...post.data,
                          title: post.data.title + ' (cópia)',
                          slug: post.data.slug + '-copia',
                          status: 'draft' as const,
                          scheduledAt: '',
                        },
                        publishedAt: null,
                      };
                      begin(copy);
                      setEditing(null);
                      setSaved('');
                    }}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      void module.archive(post).catch((e) => setError(e.message));
                    }}
                  >
                    {post.archivedAt ? 'Restaurar' : 'Arquivar'}
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Pagination offset={module.offset} total={module.total} onChange={module.setOffset} />
    </div>
  );
}
