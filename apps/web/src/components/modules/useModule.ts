import { useCallback, useEffect, useState } from 'react';
import type { ModuleKind, WorkspaceDocument } from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';

export function useCrmApi(user: AuthenticatedSession) {
  return useCallback(
    async (path: string, init?: RequestInit) => {
      if (!user.accessToken || user.preview)
        throw new Error(
          'Entre com o administrador do seu workspace para salvar. Esta prévia é somente visual.',
        );
      const response = await fetch(path, {
        ...init,
        headers: {
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          Authorization: `Bearer ${user.accessToken}`,
          ...init?.headers,
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? 'Sua sessão expirou. Entre novamente.'
            : response.status === 403
              ? 'Seu perfil não tem permissão para esta ação.'
              : (data.message ?? 'Não foi possível concluir. Tente novamente.'),
        );
      return data;
    },
    [user.accessToken, user.preview],
  );
}
export function useModule(kind: ModuleKind, user: AuthenticatedSession) {
  const request = useCrmApi(user);
  const [items, setItems] = useState<WorkspaceDocument[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [archived, setArchived] = useState(false),
    [offset, setOffset] = useState(0),
    [total, setTotal] = useState(0),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent).detail === kind) setRefresh((n) => n + 1);
    };
    window.addEventListener('crm:records-changed', changed);
    return () => window.removeEventListener('crm:records-changed', changed);
  }, [kind]);
  useEffect(() => {
    setOffset(0);
  }, [query, archived, kind]);
  useEffect(() => {
    if (!user.accessToken || user.preview) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      request(
        `/api/v1/workspace/${kind}?q=${encodeURIComponent(query)}&archived=${archived ? '1' : '0'}&offset=${offset}`,
        { signal: controller.signal },
      )
        .then((data) => {
          if (!controller.signal.aborted) {
            setItems(data.items);
            setTotal(data.total);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [kind, user.accessToken, user.preview, request, query, archived, offset, refresh]);
  const reload = () => setRefresh((n) => n + 1);
  const save = async (data: unknown, record?: WorkspaceDocument, leadId: string | null = null) => {
    const result = await request(`/api/v1/workspace/${kind}${record ? '/' + record.id : ''}`, {
      method: record ? 'PUT' : 'POST',
      body: JSON.stringify({ data, leadId, version: record?.version }),
    });
    window.dispatchEvent(new CustomEvent('crm:records-changed', { detail: kind }));
    return result.item as WorkspaceDocument;
  };
  const archive = async (record: WorkspaceDocument) => {
    await request(`/api/v1/workspace/${kind}/${record.id}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ version: record.version, archived: !record.archivedAt }),
    });
    window.dispatchEvent(new CustomEvent('crm:records-changed', { detail: kind }));
  };
  return {
    items,
    total,
    offset,
    setOffset,
    loading,
    error,
    query,
    setQuery,
    archived,
    setArchived,
    request,
    save,
    archive,
    reload,
  };
}
export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (v: unknown) => {
    let text = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
    if (/^\s*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const blob = new Blob(
    [
      '\uFEFF' +
        [
          columns.map(cell).join(';'),
          ...rows.map((row) => columns.map((c) => cell(row[c])).join(';')),
        ].join('\r\n'),
    ],
    { type: 'text/csv;charset=utf-8' },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
