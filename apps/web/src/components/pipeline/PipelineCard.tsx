import { Archive, ArrowRight, Eye, FileSignature, GripVertical, MessageSquare, RotateCcw } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@dcfoundry/ui';
import type { PipelineStage, WorkspaceLead } from '@dcfoundry/shared';
import { ContactAvatar } from '../ContactAvatar.js';

export function brl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function PipelineCard({
  lead,
  index,
  stages,
  canDrag,
  archived,
  busy,
  showAdvance,
  onOpen,
  onAdvance,
  onMove,
  onArchive,
  onRestore,
}: {
  lead: WorkspaceLead;
  index: number;
  stages: PipelineStage[];
  canDrag: boolean;
  archived: boolean;
  busy: boolean;
  showAdvance: boolean;
  onOpen: (lead: WorkspaceLead) => void;
  onAdvance: (lead: WorkspaceLead) => void;
  onMove: (lead: WorkspaceLead, stageId: string) => void;
  onArchive: (lead: WorkspaceLead) => void;
  onRestore: (lead: WorkspaceLead) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    disabled: !canDrag,
  });
  const summary = lead.aiSummary || lead.scopeSummary || 'A Foundry ainda não resumiu esta conversa.';
  return (
    <article
      ref={setNodeRef}
      className={`lead-card pipe-card${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="lead-card-person">
        {canDrag && (
          <button
            type="button"
            className="pipe-handle"
            aria-label={`Arrastar ${lead.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
        )}
        <ContactAvatar name={lead.name} photoUrl={lead.avatarUrl} index={index} />
        <span>
          <h3>{lead.name}</h3>
          <small>{lead.company}</small>
        </span>
      </div>
      {lead.highPriority && <Badge tone="warm">Prioridade</Badge>}
      <p className="pipe-summary">{summary}</p>
      <div className="lead-tag-list">
        {lead.tags?.map((tag) => (
          <span key={tag.id} style={{ borderColor: tag.color }}>
            {tag.name}
          </span>
        ))}
      </div>
      <div className="lead-card-footer">
        <strong>{brl(lead.monthlyValue)}</strong>
        <div className="pipe-actions">
          {archived ? (
            <button type="button" onClick={() => onRestore(lead)}>
              <RotateCcw size={14} /> Restaurar
            </button>
          ) : (
            <>
              <button type="button" aria-label="Abrir ficha" title="Abrir ficha" onClick={() => onOpen(lead)}>
                <Eye size={14} />
              </button>
              <button
                type="button"
                aria-label="Abrir no WhatsApp"
                title="Abrir no WhatsApp"
                onClick={() => window.dispatchEvent(new CustomEvent('crm:open-whatsapp', { detail: lead.id }))}
              >
                <MessageSquare size={14} />
              </button>
              <button
                type="button"
                aria-label="Gerar proposta"
                title="Gerar proposta"
                onClick={() => window.dispatchEvent(new CustomEvent('crm:open-page', { detail: 'contracts' }))}
              >
                <FileSignature size={14} />
              </button>
              {showAdvance && (
                <button type="button" disabled={busy} onClick={() => onAdvance(lead)}>
                  Avançar <ArrowRight size={14} />
                </button>
              )}
              <button
                type="button"
                aria-label="Arquivar contato"
                title="Arquivar"
                onClick={() => {
                  if (window.confirm(`Arquivar ${lead.name}? O contato sai do funil e pode ser restaurado.`))
                    onArchive(lead);
                }}
              >
                <Archive size={14} />
              </button>
            </>
          )}
        </div>
      </div>
      {!archived && canDrag && stages.length > 1 && (
        <label className="pipe-move">
          <span className="sr-only">Mover {lead.name} para</span>
          <select value={lead.stage} onChange={(event) => onMove(lead, event.target.value)}>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </article>
  );
}
