import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { resolveGrantedScope, type PipelineStage, type WorkspaceLead } from '@dcfoundry/shared';
import type { AuthenticatedSession } from '../../pages/LoginPage.js';
import { MobileStageStepper } from './MobileStageStepper.js';
import { PipelineCard, brl } from './PipelineCard.js';
import './pipeline.css';

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 859px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 859px)');
    const sync = () => setNarrow(media.matches);
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return narrow;
}

function StageColumn({
  stage,
  leads,
  canDrag,
  archived,
  busy,
  stages,
  onOpen,
  onAdvance,
  onMove,
  onArchive,
  onRestore,
}: {
  stage: PipelineStage;
  leads: WorkspaceLead[];
  stages: PipelineStage[];
  canDrag: boolean;
  archived: boolean;
  busy: boolean;
  onOpen: (lead: WorkspaceLead) => void;
  onAdvance: (lead: WorkspaceLead) => void;
  onMove: (lead: WorkspaceLead, stageId: string) => void;
  onArchive: (lead: WorkspaceLead) => void;
  onRestore: (lead: WorkspaceLead) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage.id}`, disabled: !canDrag });
  const total = leads.reduce((sum, lead) => sum + lead.monthlyValue, 0);
  return (
    <section ref={setNodeRef} className={`kanban-column${isOver ? ' is-over' : ''}`}>
      <header style={{ borderBottomColor: stage.color }}>
        <strong>{stage.name}</strong>
        <span className="pipe-column-total">
          {leads.length} · {brl(total)}
        </span>
      </header>
      <SortableContext items={leads.map((lead) => lead.id)} strategy={verticalListSortingStrategy}>
        {leads.map((lead, index) => (
          <PipelineCard
            key={lead.id}
            lead={lead}
            index={index}
            stages={stages}
            canDrag={canDrag}
            archived={archived}
            busy={busy}
            showAdvance={!stage.isWon && !stage.isLost}
            onOpen={onOpen}
            onAdvance={onAdvance}
            onMove={onMove}
            onArchive={onArchive}
            onRestore={onRestore}
          />
        ))}
      </SortableContext>
      {!leads.length && (
        <div className="empty-stage">
          <Plus size={22} strokeWidth={1.2} />
          <p>As próximas oportunidades desta etapa aparecem aqui.</p>
        </div>
      )}
    </section>
  );
}

export function PipelineBoard({
  user,
  stages,
  leads,
  archived,
  busy,
  onMove,
  onAdvance,
  onOpen,
  onArchive,
  onRestore,
}: {
  user: AuthenticatedSession;
  stages: PipelineStage[];
  leads: WorkspaceLead[];
  archived: boolean;
  busy: boolean;
  onMove: (lead: WorkspaceLead, stageId: string) => void;
  onAdvance: (lead: WorkspaceLead) => void;
  onOpen: (lead: WorkspaceLead) => void;
  onArchive: (lead: WorkspaceLead) => void;
  onRestore: (lead: WorkspaceLead) => void;
}) {
  const narrow = useNarrow();
  const [stageIndex, setStageIndex] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const canDrag = !archived && Boolean(resolveGrantedScope(user.roles, 'lead:update'));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const grouped = useMemo(
    () => stages.map((stage) => leads.filter((lead) => lead.stage === stage.id)),
    [leads, stages],
  );
  const safeIndex = Math.min(stageIndex, Math.max(stages.length - 1, 0));
  const visibleStages = narrow ? stages.filter((_, index) => index === safeIndex) : stages;
  const active = leads.find((lead) => lead.id === activeId);
  const finish = (event: DragEndEvent) => {
    setActiveId(null);
    const lead = leads.find((item) => item.id === String(event.active.id));
    const overId = event.over ? String(event.over.id) : '';
    if (!lead || !overId || !canDrag) return;
    const stageId = overId.startsWith('stage:') ? overId.slice('stage:'.length) : leads.find((item) => item.id === overId)?.stage;
    if (stageId && stageId !== lead.stage) onMove(lead, stageId);
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(event) => setActiveId(String(event.active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={finish}
    >
      {narrow && (
        <MobileStageStepper
          stages={stages}
          counts={grouped.map((items) => items.length)}
          totals={grouped.map((items) => items.reduce((sum, lead) => sum + lead.monthlyValue, 0))}
          index={safeIndex}
          onChange={setStageIndex}
        />
      )}
      <div className={narrow ? 'pipe-mobile' : 'kanban-board pipe-board'}>
        {visibleStages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            stages={stages}
            leads={grouped[stages.findIndex((item) => item.id === stage.id)] ?? []}
            canDrag={canDrag}
            archived={archived}
            busy={busy}
            onOpen={onOpen}
            onAdvance={onAdvance}
            onMove={onMove}
            onArchive={onArchive}
            onRestore={onRestore}
          />
        ))}
      </div>
      <DragOverlay>{active ? <div className="pipe-overlay">{active.name}</div> : null}</DragOverlay>
    </DndContext>
  );
}
