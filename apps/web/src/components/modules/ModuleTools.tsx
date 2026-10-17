import { useEffect, type ReactNode } from 'react';
import { Search, X, Plus, Download, Archive, RefreshCw } from 'lucide-react';
import { Button, Card } from '@dcfoundry/ui';
import { useDialogFocus } from '../useDialogFocus.js';
import type { WorkspaceDocument } from '@dcfoundry/shared';

export function ModuleToolbar({
  query,
  onQuery,
  onCreate,
  label,
  archived,
  onArchived,
  onExport,
  onRefresh,
}: {
  query: string;
  onQuery: (s: string) => void;
  onCreate: () => void;
  label: string;
  archived: boolean;
  onArchived: (v: boolean) => void;
  onExport?: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="module-toolbar">
      <label className="module-search">
        <Search size={17} />
        <input
          aria-label="Buscar registros"
          placeholder="Buscar nesta área..."
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </label>
      <div className="module-actions">
        <button
          type="button"
          className="icon-button"
          aria-label="Atualizar registros"
          onClick={onRefresh}
        >
          <RefreshCw size={17} />
        </button>
        <button
          type="button"
          className="module-filter"
          aria-pressed={archived}
          onClick={() => onArchived(!archived)}
        >
          <Archive size={15} />
          {archived ? 'Ver ativos' : 'Arquivados'}
        </button>
        {onExport && (
          <button className="module-filter" type="button" onClick={onExport}>
            <Download size={15} />
            CSV desta página
          </button>
        )}
        <Button onClick={onCreate}>
          <Plus size={16} />
          {label}
        </Button>
      </div>
    </div>
  );
}
export function ModuleEmpty({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <Card className="module-empty">
      <span className="module-empty-orbit" aria-hidden="true">
        <Plus size={32} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      <Button onClick={onAction}>
        <Plus size={16} />
        {action}
      </Button>
    </Card>
  );
}
export function ModuleNotice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <p
      role={error ? 'alert' : 'status'}
      className={`workspace-notice${error ? ' module-error' : ''}`}
    >
      {children}
    </p>
  );
}
export function Pagination({
  offset,
  total,
  onChange,
}: {
  offset: number;
  total: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="module-pagination">
      <span>
        {total ? `${offset + 1}–${Math.min(offset + 100, total)} de ${total}` : 'Nenhum registro'}
      </span>
      <button
        type="button"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - 100))}
      >
        Anterior
      </button>
      <button type="button" disabled={offset + 100 >= total} onClick={() => onChange(offset + 100)}>
        Próxima
      </button>
    </div>
  );
}
export function ModuleDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useDialogFocus(true);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);
  return (
    <div className="workspace-dialog-overlay">
      <section
        className="workspace-dialog module-record-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-crm-dialog
      >
        <header className="panel-heading">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar editor"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function RecordHistory({
  items,
  onRestore,
}: {
  items: { version: number; data: unknown; savedAt: string }[];
  onRestore: (data: unknown) => void;
}) {
  return (
    <div className="record-history">
      {!items.length ? (
        <p>A primeira versão é criada quando você edita um registro salvo.</p>
      ) : (
        items.map((i) => (
          <article key={i.version}>
            <div>
              <strong>Versão {i.version}</strong>
              <span>{new Date(i.savedAt).toLocaleString('pt-BR')}</span>
            </div>
            <button type="button" className="text-button" onClick={() => onRestore(i.data)}>
              Carregar no editor
            </button>
          </article>
        ))
      )}
    </div>
  );
}
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const navigate = (e: Event) => {
      if (!window.confirm('Há alterações não salvas. Sair sem salvar?')) e.preventDefault();
    };
    window.addEventListener('beforeunload', unload);
    window.addEventListener('crm:navigate', navigate);
    return () => {
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('crm:navigate', navigate);
    };
  }, [dirty]);
}
export const money = (cents: number) =>
  ((cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const statusLabel: Record<string, string> = {
  site_landing:'Site / landing page',system_app:'Sistema / aplicativo',paid_marketing:'Tráfego pago e marketing',maintenance:'Manutenção / suporte',public:'Clientes e equipe',internal:'Somente equipe',
  planning: 'Planejamento',
  design: 'Design',
  development: 'Desenvolvimento',
  review: 'Em revisão',
  paused: 'Pausado',
  draft: 'Rascunho',
  scheduled: 'Agendado',
  published: 'Publicado',
  sent: 'Enviado',
  accepted: 'Aceite registrado',
  active: 'Ativo',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  open: 'Em aberto',
  paid: 'Recebido',
  done: 'Concluída',
  high: 'Alta',
  normal: 'Normal',
  project: 'Projeto',
  monthly: 'Mensal',
  not_configured: 'Conexão pendente',
  pending: 'Na fila',
  delivered: 'Site atualizado',
  retry: 'Nova tentativa',
};
export function flattenRecord(record: WorkspaceDocument) {
  return { id: record.id, ...record.data, atualizadoEm: record.updatedAt };
}
