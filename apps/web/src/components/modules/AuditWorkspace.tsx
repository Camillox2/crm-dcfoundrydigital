import { useEffect, useState } from 'react';
import { Download, RefreshCw, Search } from 'lucide-react';
import { Card } from '@dcfoundry/ui';
import type { AuditItem } from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { useCrmApi, downloadCsv } from './useModule.js';
import { ModuleNotice } from './ModuleTools.js';
export function AuditWorkspace({ user }: { user: AuthenticatedSession }) {
  const request = useCrmApi(user),
    [items, setItems] = useState<AuditItem[]>([]),
    [query, setQuery] = useState(''),
    [offset, setOffset] = useState(0),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    setOffset(0);
  }, [query]);
  useEffect(() => {
    if (!user.accessToken || user.preview) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      request(`/api/v1/workspace/audit?q=${encodeURIComponent(query)}&offset=${offset}`, {
        signal: controller.signal,
      })
        .then((r) => {
          if (!controller.signal.aborted) {
            setItems(r.items);
            setError('');
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [request, query, offset, refresh, user.accessToken, user.preview]);
  return (
    <div className="module-workspace">
      <div className="module-toolbar">
        <label className="module-search">
          <Search size={17} />
          <input
            aria-label="Buscar no histórico"
            placeholder="Buscar ação ou pessoa..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="module-actions">
          <button className="module-filter" onClick={() => setRefresh((n) => n + 1)}>
            <RefreshCw size={15} />
            Atualizar
          </button>
          <button
            className="module-filter"
            disabled={!items.length}
            onClick={() =>
              downloadCsv('historico-crm.csv', items as unknown as Record<string, unknown>[])
            }
          >
            <Download size={15} />
            Exportar esta página
          </button>
        </div>
      </div>
      {error && <ModuleNotice error>{error}</ModuleNotice>}
      {loading ? (
        <p role="status">Carregando histórico...</p>
      ) : (
        <Card className="audit-records">
          {!items.length ? (
            <p>Nenhuma atividade encontrada. Ações gravadas no workspace aparecem aqui.</p>
          ) : (
            items.map((item) => (
              <details key={item.id}>
                <summary>
                  <span>
                    <strong>{item.action}</strong>
                    <small>
                      {item.actorName ?? 'Sistema'} · {item.entityType}
                    </small>
                  </span>
                  <time>{new Date(item.createdAt).toLocaleString('pt-BR')}</time>
                </summary>
                <p>ID do registro: {item.entityId}</p>
                <pre>{JSON.stringify(item.diff, null, 2)}</pre>
              </details>
            ))
          )}
        </Card>
      )}
      <div className="module-pagination">
        <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>
          Anterior
        </button>
        <span>Página {offset / 100 + 1}</span>
        <button disabled={items.length < 100} onClick={() => setOffset(offset + 100)}>
          Próxima
        </button>
      </div>
      <p className="module-footnote">
        Histórico persistente e somente leitura. O seu perfil determina quais atividades podem ser
        consultadas.
      </p>
    </div>
  );
}
