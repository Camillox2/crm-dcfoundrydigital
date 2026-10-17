import { useCallback, useEffect, useState } from 'react';
import {
  resolveGrantedScope,
  type WorkspaceLead,
  type WorkspaceLeadInput,
} from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../pages/LoginPage.js';

export function useWorkspace(user: AuthenticatedSession | null) {
  const [leads, setLeads] = useState<WorkspaceLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useCallback(
    async (url: string, init?: RequestInit) => {
      if (!user?.accessToken || user.preview)
        throw new Error('Configure a API e o administrador no VPS para salvar contatos reais.');
      const response = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.accessToken}`,
          ...init?.headers,
        },
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? 'Sua sessão expirou. Entre novamente.'
            : 'Não foi possível acessar o workspace. Confira a API e o banco configurados.',
        );
      return response.json();
    },
    [user],
  );
  useEffect(() => {
    setLeads([]);
    setError(null);
    if (!user?.accessToken || user.preview || !resolveGrantedScope(user.roles, 'lead:read')) return;
    const controller = new AbortController();
    setLoading(true);
    request('/api/v1/workspace/leads', { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setLeads(data.items);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'Não foi possível carregar os contatos.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [request, user]);
  const create = async (input: WorkspaceLeadInput) => {
    const data = await request('/api/v1/workspace/leads', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setLeads((current) => [data.item, ...current]);
    return data.item as WorkspaceLead;
  };
  const advance = async (lead: WorkspaceLead) => {
    const stages = ['novo', 'qualificado_ia', 'orcamento', 'contrato_ativo'] as const;
    const next = stages[Math.min(stages.indexOf(lead.stage) + 1, stages.length - 1)];
    const data = await request(`/api/v1/workspace/leads/${encodeURIComponent(lead.id)}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stage: next }),
    });
    setLeads((current) => current.map((item) => (item.id === lead.id ? data.item : item)));
  };
  const update = async (id: string, input: WorkspaceLeadInput) => {
    const data = await request(`/api/v1/workspace/leads/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    setLeads((current) => current.map((item) => (item.id === id ? data.item : item)));
    return data.item as WorkspaceLead;
  };
  const archive = async (id: string) => {
    await request(`/api/v1/workspace/leads/${id}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    });
    setLeads((current) => current.filter((item) => item.id !== id));
  };
  const archived = async () => {
    const data = await request('/api/v1/workspace/leads?archived=1');
    return data.items as WorkspaceLead[];
  };
  const restore = async (id: string) => {
    await request(`/api/v1/workspace/leads/${id}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: false }),
    });
    const data = await request('/api/v1/workspace/leads');
    setLeads(data.items);
  };
  return { leads, loading, error, create, advance, update, archive, archived, restore };
}
