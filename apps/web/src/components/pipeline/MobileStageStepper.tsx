import type { PipelineStage } from '@dcfoundry/shared';
import { brl } from './PipelineCard.js';

export function MobileStageStepper({
  stages,
  counts,
  totals,
  index,
  onChange,
}: {
  stages: PipelineStage[];
  counts: number[];
  totals: number[];
  index: number;
  onChange: (index: number) => void;
}) {
  const stage = stages[index];
  if (!stage) return null;
  return (
    <div className="pipe-stepper">
      <div className="pipe-stepper-nav">
        <button type="button" aria-label="Etapa anterior" disabled={index <= 0} onClick={() => onChange(index - 1)}>
          ‹
        </button>
        <div>
          <strong>{stage.name}</strong>
          <span>
            {counts[index] ?? 0} leads · {brl(totals[index] ?? 0)}
          </span>
        </div>
        <button
          type="button"
          aria-label="Próxima etapa"
          disabled={index >= stages.length - 1}
          onClick={() => onChange(index + 1)}
        >
          ›
        </button>
      </div>
      <div className="pipe-track" role="tablist" aria-label="Etapas do funil">
        {stages.map((item, itemIndex) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={itemIndex === index}
            aria-label={item.name}
            onClick={() => onChange(itemIndex)}
          />
        ))}
      </div>
    </div>
  );
}
