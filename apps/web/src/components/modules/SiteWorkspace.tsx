import { useEffect, useState } from 'react';
import { ArrowRight, Check, Copy, ExternalLink, Globe, Link2, RefreshCw } from 'lucide-react';
import { Card, Button } from '@dcfoundry/ui';
import { resolveGrantedScope, type WorkspacePage } from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi, downloadCsv } from './useModule.js';
import { ModuleNotice } from './ModuleTools.js';
import { ContentTable, useOperationsReport } from './OperationsDashboard.js';

const destinations = [
  {
    label: 'Página inicial',
    path: '/',
    intent: 'Institucional e descoberta da marca',
  },
  {
    label: 'Sites em Curitiba',
    path: '/criacao-de-sites-curitiba',
    intent: 'Sites e landing pages',
  },
  {
    label: 'Software sob medida',
    path: '/desenvolvimento-software-curitiba',
    intent: 'Sistemas e desenvolvimento',
  },
  {
    label: 'Agentes de IA',
    path: '/agentes-ia-empresas',
    intent: 'Assistentes e agentes para empresas',
  },
  {
    label: 'Automação com IA',
    path: '/automacao-com-ia',
    intent: 'Integrações e processos',
  },
  {
    label: 'Sistemas e CRM',
    path: '/sistemas-corporativos',
    intent: 'Gestão e operação',
  },
  {
    label: 'Monte seu projeto',
    path: '/monte-seu-projeto',
    intent: 'Briefing e expectativa de projeto',
  },
  { label: 'Blog', path: '/blog', intent: 'Conteúdo e busca orgânica' },
];
type Integrations = {
  database: boolean;
  gemini: boolean;
  blogSync: boolean;
  adsIngest: boolean;
  siteEvents: boolean;
  siteUrl: string;
  whatsapp: string;
};
export function SiteWorkspace({
  user,
  onNavigate,
}: {
  user: AuthenticatedSession;
  onNavigate: (page: WorkspacePage) => void;
}) {
  const request = useCrmApi(user),
    { report, error: reportError } = useOperationsReport(user);
  const [status, setStatus] = useState<Integrations | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0);
  const [health, setHealth] = useState<{
      checkedAt: string;
      checks: {
        path: string;
        status: number | null;
        ok: boolean;
        durationMs: number;
      }[];
    } | null>(null),
    [checking, setChecking] = useState(false);
  const [path, setPath] = useState('/criacao-de-sites-curitiba'),
    [source, setSource] = useState('google'),
    [medium, setMedium] = useState('cpc'),
    [campaign, setCampaign] = useState(''),
    [term, setTerm] = useState(''),
    [content, setContent] = useState('');
  useEffect(() => {
    if (user.preview) return;
    const c = new AbortController();
    request('/api/v1/workspace/integrations', { signal: c.signal })
      .then(setStatus)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [request, user.preview, revision]);
  const site = (() => {
    try {
      const url = new URL(status?.siteUrl ?? 'https://dcfoundrydigital.com');
      return url.protocol === 'https:' ? url.origin : 'https://dcfoundrydigital.com';
    } catch {
      return 'https://dcfoundrydigital.com';
    }
  })();
  const tracked = new URL(path, site);
  Object.entries({
    utm_source: source,
    utm_medium: medium,
    utm_campaign: campaign,
    utm_term: term,
    utm_content: content,
  }).forEach(([key, value]) => {
    if (value.trim()) tracked.searchParams.set(key, value.trim());
  });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tracked.href);
      setNotice('Link de campanha copiado.');
    } catch {
      setError('Copie o link selecionando o campo abaixo.');
    }
  };
  const checkSite = async () => {
    setChecking(true);
    setError('');
    try {
      setHealth(await request('/api/v1/workspace/site-health'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };
  const sync = async () => {
    setError('');
    setNotice('');
    try {
      const result = await request('/api/v1/workspace/blog-sync', {
        method: 'POST',
      });
      setNotice(
        result.status === 'not_configured'
          ? 'Configure a conexão do blog no VPS para atualizar o site.'
          : `${result.delivered ?? 0} atualizações entregues ao site. Indexação depende dos buscadores.`,
      );
      setRevision((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const checklist = [
    {
      label: 'Banco do CRM',
      ready: status?.database,
      text: 'Persistência dos cadastros e documentos.',
    },
    {
      label: 'Blog → site',
      ready: status?.blogSync,
      text: 'Webhook de atualização do site e fila de publicação.',
    },
    {
      label: 'Eventos do site → CRM',
      ready: status?.siteEvents,
      text: 'Visualizações e cliques recebidos pelo endpoint protegido.',
    },
    {
      label: 'Script Google Ads',
      ready: status?.adsIngest,
      text: 'Recebimento de métricas diárias autenticadas.',
    },
    {
      label: 'Foundry IA',
      ready: status?.gemini,
      text: 'Provedor Gemini configurado no servidor.',
    },
  ];
  return (
    <div className="module-workspace ops-site">
      {(error || reportError) && <ModuleNotice error>{error || reportError}</ModuleNotice>}
      {notice && <ModuleNotice>{notice}</ModuleNotice>}
      <div className="ops-chart-grid">
        <Card className="ops-data-card">
          <div className="panel-heading">
            <div>
              <h3>Suas conexões</h3>
              <p>Configuração detectada; atividade e dados aparecem nos relatórios.</p>
            </div>
            <button
              className="icon-button"
              aria-label="Atualizar conexões"
              onClick={() => setRevision((v) => v + 1)}
            >
              <RefreshCw size={17} />
            </button>
          </div>
          <div className="ops-integrations">
            {checklist.map((c) => (
              <div key={c.label}>
                <i data-ready={Boolean(c.ready)}>
                  {c.ready ? <Check size={14} /> : <Link2 size={14} />}
                </i>
                <span>
                  <strong>{c.label}</strong>
                  <small>{c.text}</small>
                </span>
                <b>{c.ready ? 'Configurado' : status ? 'Configurar no VPS' : 'Não verificado'}</b>
              </div>
            ))}
          </div>
          <p className="ops-footnote">
            Confira a conexão e o pareamento na área WhatsApp. A configuração do worker não
            confirma uma sessão conectada; as métricas de campanhas vêm da integração autenticada.
          </p>
        </Card>
        <Card className="ops-data-card">
          <div className="panel-heading">
            <div>
              <h3>Publicação e descoberta</h3>
              <p>Ferramentas do domínio que já podem ser consultadas.</p>
            </div>
            <Globe size={21} />
          </div>
          <div className="ops-resource-links">
            {[
              { label: 'Blog público', path: '/blog' },
              { label: 'Sitemap XML', path: '/sitemap.xml' },
              { label: 'Instruções de rastreamento', path: '/robots.txt' },
              { label: 'Conteúdo para assistentes de IA', path: '/llms.txt' },
            ].map((link) => (
              <a key={link.path} href={site + link.path} target="_blank" rel="noopener noreferrer">
                {link.label}
                <ExternalLink size={16} />
              </a>
            ))}
          </div>
          <div className="module-actions">
            {(user.preview || resolveGrantedScope(user.roles, 'blog:update')) && (
              <Button onClick={sync} disabled={user.preview}>
                Reprocessar fila do blog <RefreshCw size={16} />
              </Button>
            )}
            <button className="text-button" onClick={() => onNavigate('reports')}>
              Ver indicadores <ArrowRight size={16} />
            </button>
          </div>
          <p className="ops-footnote">
            Sitemap, webhook e IndexNow ajudam a descobrir atualizações. A inclusão nos resultados
            depende de cada buscador.
          </p>
        </Card>
      </div>
      <Card className="ops-data-card">
        <div className="panel-heading">
          <div>
            <h3>Destinos para cada intenção</h3>
            <p>Use a página correspondente à campanha para manter a promessa do anúncio.</p>
          </div>
        </div>
        <div className="ops-destinations">
          {destinations.map((d) => (
            <article key={d.path}>
              <div>
                <strong>{d.label}</strong>
                <small>{d.intent}</small>
                <code>{d.path}</code>
              </div>
              <div>
                <a
                  href={site + d.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Abrir ${d.label}`}
                  className="icon-button"
                >
                  <ExternalLink size={17} />
                </a>
                <button
                  className="module-filter"
                  onClick={() => {
                    setPath(d.path);
                    document
                      .getElementById('utm-generator')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  Criar link UTM
                </button>
              </div>
            </article>
          ))}
        </div>
      </Card>
      <Card className="ops-data-card" id="utm-generator">
        <div className="panel-heading">
          <div>
            <h3>Gerador de links de campanha</h3>
            <p>Organize origem, mídia e campanha sem alterar o site ou os anúncios.</p>
          </div>
          <Link2 size={21} />
        </div>
        <div className="ops-utm-fields">
          <label>
            Página de destino
            <select value={path} onChange={(e) => setPath(e.target.value)}>
              {destinations.map((d) => (
                <option value={d.path} key={d.path}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Origem
            <input
              value={source}
              maxLength={100}
              onChange={(e) => setSource(e.target.value)}
              placeholder="google, instagram, newsletter"
            />
          </label>
          <label>
            Mídia
            <input
              value={medium}
              maxLength={100}
              onChange={(e) => setMedium(e.target.value)}
              placeholder="cpc, social, email"
            />
          </label>
          <label>
            Campanha
            <input
              value={campaign}
              maxLength={150}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="sites-curitiba-outubro"
            />
          </label>
          <label>
            Termo (opcional)
            <input value={term} maxLength={150} onChange={(e) => setTerm(e.target.value)} />
          </label>
          <label>
            Variação do conteúdo (opcional)
            <input value={content} maxLength={150} onChange={(e) => setContent(e.target.value)} />
          </label>
        </div>
        <label className="ops-generated-url">
          Link gerado
          <input
            aria-label="Link UTM gerado"
            readOnly
            value={tracked.href}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
        <div className="module-actions">
          <Button onClick={copy}>
            <Copy size={16} />
            Copiar link
          </Button>
          <button
            className="module-filter"
            onClick={() =>
              downloadCsv('link-de-campanha.csv', [
                {
                  url: tracked.href,
                  pagina: path,
                  origem: source,
                  midia: medium,
                  campanha: campaign,
                  termo: term,
                  conteudo: content,
                },
              ])
            }
          >
            Exportar CSV
          </button>
          <button
            className="text-button"
            onClick={() => {
              setSource('google');
              setMedium('cpc');
              setCampaign('');
              setTerm('');
              setContent('');
            }}
          >
            Limpar parâmetros
          </button>
        </div>
      </Card>
      <Card className="ops-data-card">
        <div className="panel-heading">
          <div>
            <h3>Disponibilidade do site</h3>
            <p>Verificação HTTP sob demanda das páginas e arquivos públicos do domínio.</p>
          </div>
          <Button onClick={checkSite} disabled={checking || user.preview}>
            {checking ? 'Verificando...' : 'Verificar agora'}
            <RefreshCw size={16} />
          </Button>
        </div>
        {health ? (
          <>
            <p className="ops-footnote">
              Verificado em {new Date(health.checkedAt).toLocaleString('pt-BR')}. Não substitui um
              monitor contínuo nem uma auditoria de SEO.
            </p>
            <div className="ops-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Recurso</th>
                    <th>HTTP</th>
                    <th>Tempo de resposta</th>
                  </tr>
                </thead>
                <tbody>
                  {health.checks.map((c) => (
                    <tr key={c.path}>
                      <td>{c.path}</td>
                      <td>
                        {c.status ?? 'Sem resposta'} · {c.ok ? 'Disponível' : 'Verificar'}
                      </td>
                      <td>{c.durationMs} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="ops-empty-copy">
            Clique para conferir a página inicial, blog, sitemap, robots e llms.txt.
          </p>
        )}
      </Card>
      {report?.access.blog && <ContentTable report={report} onNavigate={onNavigate} />}
      <Card className="ops-data-card">
        <h3>Como ligar o site ao CRM no VPS</h3>
        <p>
          O receptor de eventos está em <code>POST /api/v1/integrations/site/events</code>.
          Configure <code>CRM_SITE_INGEST_TOKEN</code> e <code>CRM_SITE_OWNER_ID</code> no servidor.
          O site encaminha os eventos pelo backend; o token não deve aparecer no navegador.
        </p>
        <p>
          Envie apenas evento, caminho e parâmetros de campanha. Não envie conversas, nomes,
          telefones ou texto de formulários para os gráficos. O guia de implantação e o exemplo de
          integração estão em <code>docs/INTEGRATIONS.md</code>.
        </p>
      </Card>
    </div>
  );
}
