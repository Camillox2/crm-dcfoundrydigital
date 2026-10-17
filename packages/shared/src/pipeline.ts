import { z } from 'zod';
export const PipelineStageInput = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),
    name: z.string().trim().min(2).max(120),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    slaMinutes: z.number().int().min(1).max(43200),
    isWon: z.boolean(),
    isLost: z.boolean(),
  })
  .refine((v) => !(v.isWon && v.isLost), 'Uma etapa não pode ser ganha e perdida ao mesmo tempo.');
export type PipelineStage = z.infer<typeof PipelineStageInput>;
export const DEFAULT_PIPELINE_STAGES: PipelineStage[] = [
  { id: 'novo', name: 'Novo', color: '#246ba5', slaMinutes: 30, isWon: false, isLost: false },
  {
    id: 'qualificado_ia',
    name: 'Qualificado',
    color: '#198980',
    slaMinutes: 120,
    isWon: false,
    isLost: false,
  },
  {
    id: 'reuniao',
    name: 'Reunião',
    color: '#6076bc',
    slaMinutes: 1440,
    isWon: false,
    isLost: false,
  },
  {
    id: 'orcamento',
    name: 'Proposta',
    color: '#bb7c38',
    slaMinutes: 1440,
    isWon: false,
    isLost: false,
  },
  {
    id: 'negociacao',
    name: 'Negociação',
    color: '#8763b6',
    slaMinutes: 1440,
    isWon: false,
    isLost: false,
  },
  {
    id: 'contrato_ativo',
    name: 'Ganho',
    color: '#21865c',
    slaMinutes: 1440,
    isWon: true,
    isLost: false,
  },
  {
    id: 'perdido',
    name: 'Perdido',
    color: '#ac5963',
    slaMinutes: 1440,
    isWon: false,
    isLost: true,
  },
];
export const PipelineConfigInput = z
  .object({
    version: z.number().int().positive(),
    stages: z.array(PipelineStageInput).min(3).max(20),
  })
  .superRefine(({ stages }, ctx) => {
    if (
      new Set(stages.map((s) => s.id)).size !== stages.length ||
      stages[0]?.id !== 'novo' ||
      stages.filter((s) => s.isWon).length !== 1 ||
      stages.filter((s) => s.isLost).length !== 1
    )
      ctx.addIssue({
        code: 'custom',
        path: ['stages'],
        message: 'Mantenha Novo no início, identificadores únicos, uma etapa ganha e uma perdida.',
      });
  });
export const isWonLead = (lead: { stage: string; stageIsWon?: boolean }) =>
  lead.stageIsWon ?? lead.stage === 'contrato_ativo';
export const isLostLead = (lead: { stage: string; stageIsLost?: boolean }) =>
  lead.stageIsLost ?? lead.stage === 'perdido';
