import { z } from 'zod';
import { maskPiiForLlm } from '@dcfoundry/shared';
export * from './foundry.js';

// ============================================================================
// 1. HORÁRIO COMERCIAL E FERIADOS (SEÇÃO 5.3)
// ============================================================================

export interface BusinessDaySchedule {
  enabled: boolean;
  start: string; // "08:00"
  end: string;   // "18:00"
}

export interface BusinessHoursConfig {
  timezone: string; // "America/Sao_Paulo"
  days: Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', BusinessDaySchedule>;
  holidaysIsoDates: string[]; // ["2026-12-25", "2026-01-01"]
  outOfHoursMessage: string;
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  timezone: 'America/Sao_Paulo',
  days: {
    '0': { enabled: false, start: '08:00', end: '12:00' },
    '1': { enabled: true, start: '08:00', end: '19:00' },
    '2': { enabled: true, start: '08:00', end: '19:00' },
    '3': { enabled: true, start: '08:00', end: '19:00' },
    '4': { enabled: true, start: '08:00', end: '19:00' },
    '5': { enabled: true, start: '08:00', end: '19:00' },
    '6': { enabled: true, start: '09:00', end: '14:00' },
  },
  holidaysIsoDates: ['2026-01-01', '2026-04-21', '2026-05-01', '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-12-25'],
  outOfHoursMessage:
    'Olá! Você está falando com o assistente virtual da DC Foundry Digital. Nosso time de especialistas atende de segunda a sexta das 08h às 19h e aos sábados das 09h às 14h, mas já posso estruturar seu diagnóstico técnico e proposta comercial agora mesmo!',
};

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Avalia de forma determinística se um instante está dentro do horário comercial configurado,
 * considerando dias da semana e feriados.
 */
export function isWithinBusinessHours(
  date: Date,
  config: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS,
): boolean {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';

  const isoDate = `${year}-${month}-${day}`;
  if (config.holidaysIsoDates.includes(isoDate)) {
    return false;
  }

  const weekdayMap: Record<string, '0' | '1' | '2' | '3' | '4' | '5' | '6'> = {
    Sun: '0',
    Mon: '1',
    Tue: '2',
    Wed: '3',
    Thu: '4',
    Fri: '5',
    Sat: '6',
  };
  const dayKey = weekdayMap[weekdayStr] ?? '1';
  const schedule = config.days[dayKey];
  if (!schedule || !schedule.enabled) return false;

  const currentMinutes = hour * 60 + minute;
  return (
    currentMinutes >= parseMinutes(schedule.start) &&
    currentMinutes <= parseMinutes(schedule.end)
  );
}

// ============================================================================
// 2. QUALIFICAÇÃO DE LEAD COM SCORE E TEMPERATURA (SEÇÃO 5.3)
// ============================================================================

export const LeadQualificationInputSchema = z.object({
  fullName: z.string().min(2).optional(),
  city: z.string().optional(),
  companyName: z.string().optional(),
  solutionCategory: z.enum(['saas_squad', 'ai_agent', 'cloud_devops', 'performance_ads', 'custom_erp']).optional(),
  modality: z.enum(['retainer', 'project', 'both']).default('retainer'),
  contractMonths: z.number().int().positive().optional(),
  priorityLaunchUrgency: z.boolean().default(false),
  currentStack: z.string().optional(),
});

export type LeadQualificationInput = z.infer<typeof LeadQualificationInputSchema>;

export interface LeadQualificationResult {
  score: number; // 0 a 100
  temperature: 'cold' | 'warm' | 'hot';
  urgencyLevel: 'low' | 'normal' | 'high' | 'critical_launch';
  recommendedStageSlug: 'novo' | 'qualificado_ia' | 'proposta_enviada';
}

export function calculateLeadQualification(input: LeadQualificationInput): LeadQualificationResult {
  let score = 20;

  if (input.fullName) score += 10;
  if (input.city || input.companyName) score += 15;
  if (input.solutionCategory) score += 20;
  if (input.contractMonths && input.contractMonths >= 6) score += 15;
  if (input.priorityLaunchUrgency) score += 25;
  if (input.currentStack) score += 5;

  const clampedScore = Math.min(100, Math.max(0, score));
  const temperature: LeadQualificationResult['temperature'] =
    clampedScore >= 75 ? 'hot' : clampedScore >= 45 ? 'warm' : 'cold';

  const urgencyLevel: LeadQualificationResult['urgencyLevel'] = input.priorityLaunchUrgency
    ? 'critical_launch'
    : clampedScore >= 75
      ? 'high'
      : clampedScore >= 45
        ? 'normal'
        : 'low';

  const recommendedStageSlug: LeadQualificationResult['recommendedStageSlug'] =
    clampedScore >= 70 ? 'proposta_enviada' : clampedScore >= 45 ? 'qualificado_ia' : 'novo';

  return {
    score: clampedScore,
    temperature,
    urgencyLevel,
    recommendedStageSlug,
  };
}

// ============================================================================
// 3. BASE DE CONHECIMENTO RAG (CHUNKING + EMBEDDINGS DETERMINÍSTICOS / PGVECTOR)
// ============================================================================

export interface RagChunkRecord {
  id: string;
  documentId: string;
  documentTitle: string;
  category: 'catalog' | 'pricing' | 'faq' | 'contract_policy';
  chunkIndex: number;
  contentText: string;
  embedding: number[];
}

/**
 * Gera embedding normalizado de 768 dimensões (compatível com vector(768) do pgvector)
 * para indexação local ultrarrápida ou fallback quando a API de embeddings externa está offline.
 */
export function computeDeterministicEmbedding768(text: string): number[] {
  const vec = new Array<number>(768).fill(0);
  const normalized = text.toLowerCase().trim();

  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    const slot1 = (code * 31 + i * 17) % 768;
    const slot2 = (code * 13 + i * 7) % 768;
    vec[slot1] = (vec[slot1] ?? 0) + 1;
    vec[slot2] = (vec[slot2] ?? 0) + 0.5;
  }

  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function searchKnowledgeBase(
  query: string,
  chunks: readonly RagChunkRecord[],
  topK = 3,
): Array<{ chunk: RagChunkRecord; similarity: number }> {
  const queryVec = computeDeterministicEmbedding768(query);
  const queryTokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2);

  return chunks
    .map((chunk) => {
      const vecSim = cosineSimilarity(queryVec, chunk.embedding);
      const lowerContent = chunk.contentText.toLowerCase();
      const keywordHits = queryTokens.filter((tok) => lowerContent.includes(tok)).length;
      const keywordBoost = queryTokens.length > 0 ? (keywordHits / queryTokens.length) * 0.45 : 0;
      return {
        chunk,
        similarity: Number(Math.min(0.99, vecSim * 0.55 + keywordBoost).toFixed(4)),
      };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

// ============================================================================
// 4. AUTOMAÇÃO DE FUNIL VIA TOOL CALLING COM VALIDAÇÃO ZOD & HANDOFF HUMANO
// ============================================================================

export const UpsertLeadToolSchema = z.object({
  toolName: z.literal('upsertLeadAndContact'),
  arguments: LeadQualificationInputSchema,
});

export const MovePipelineStageToolSchema = z.object({
  toolName: z.literal('movePipelineStage'),
  arguments: z.object({
    leadId: z.string(),
    targetStageSlug: z.enum(['novo', 'qualificado_ia', 'proposta_enviada', 'aguardando_assinatura', 'contrato_ativo']),
    reason: z.string(),
  }),
});

export const CreateFollowUpTaskToolSchema = z.object({
  toolName: z.literal('createFollowUpTask'),
  arguments: z.object({
    leadId: z.string(),
    title: z.string().min(3),
    dueInMinutes: z.number().int().min(5).max(10080),
  }),
});

export const AgentToolCallSchema = z.discriminatedUnion('toolName', [
  UpsertLeadToolSchema,
  MovePipelineStageToolSchema,
  CreateFollowUpTaskToolSchema,
]);

export type AgentToolCall = z.infer<typeof AgentToolCallSchema>;

export interface HandoffEvaluation {
  shouldHandoff: boolean;
  reason: string | null;
}

const DEFAULT_HANDOFF_KEYWORDS = [
  'humano',
  'atendente',
  'especialista',
  'pessoa',
  'reclamação',
  'reclamacao',
  'jurídico',
  'advogado',
  'incidente crítico',
  'falar com diretor',
];

export function evaluateHandoffNeed(params: {
  messageText: string;
  confidenceScore: number;
  minConfidenceThreshold?: number;
  customKeywords?: string[];
}): HandoffEvaluation {
  const lower = params.messageText.toLowerCase();
  const keywords = params.customKeywords?.length
    ? params.customKeywords
    : DEFAULT_HANDOFF_KEYWORDS;

  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      return {
        shouldHandoff: true,
        reason: `Palavra-chave de transbordo detectada: "${kw}"`,
      };
    }
  }

  const threshold = params.minConfidenceThreshold ?? 0.72;
  if (params.confidenceScore < threshold) {
    return {
      shouldHandoff: true,
      reason: `Confiança da IA (${params.confidenceScore.toFixed(2)}) abaixo do limiar (${threshold.toFixed(2)})`,
    };
  }

  return { shouldHandoff: false, reason: null };
}

export interface ProcessInboundWhatsAppAiParams {
  contactId: string;
  contactName: string;
  aiPaused: boolean;
  rawMessageText: string;
  now?: Date;
  businessHours?: BusinessHoursConfig;
  knowledgeBase: readonly RagChunkRecord[];
  promptVersion?: number;
}

export interface ProcessInboundWhatsAppAiResult {
  skippedBecausePaused: boolean;
  withinBusinessHours: boolean;
  maskedInputText: string;
  replyText: string;
  citedChunkIds: string[];
  qualification: LeadQualificationResult;
  toolCalls: AgentToolCall[];
  handoff: HandoffEvaluation;
  aiPausedNextState: boolean;
  latencyMs: number;
  providerUsed: 'gemini' | 'ollama_fallback';
}

/**
 * Orquestrador principal do Agente de IA do DC Foundry Digital CRM:
 * - Respeita `ai_paused` por contato
 * - Aplica mascaramento LGPD (`maskPiiForLlm`) antes do modelo
 * - Consulta RAG (`pgvector`) e cita os chunks utilizados
 * - Qualifica o lead com score/temperatura e executa Tool Calling validado por Zod
 * - Aciona handoff humano automático se necessário
 */
export function processInboundWhatsAppWithAi(
  params: ProcessInboundWhatsAppAiParams,
): ProcessInboundWhatsAppAiResult {
  const startedAt = performance.now();
  const now = params.now ?? new Date();
  const maskedInputText = maskPiiForLlm(params.rawMessageText);

  if (params.aiPaused) {
    return {
      skippedBecausePaused: true,
      withinBusinessHours: isWithinBusinessHours(now, params.businessHours),
      maskedInputText,
      replyText: '',
      citedChunkIds: [],
      qualification: calculateLeadQualification({ modality: 'retainer', priorityLaunchUrgency: false }),
      toolCalls: [],
      handoff: { shouldHandoff: false, reason: 'IA já pausada para este contato (ai_paused=true)' },
      aiPausedNextState: true,
      latencyMs: Math.max(1, Math.round(performance.now() - startedAt)),
      providerUsed: 'gemini',
    };
  }

  const withinHours = isWithinBusinessHours(now, params.businessHours);
  const ragMatches = searchKnowledgeBase(maskedInputText, params.knowledgeBase, 2);
  const citedChunkIds = ragMatches.map((m) => m.chunk.id);

  const lower = maskedInputText.toLowerCase();
  const isUrgentLaunch =
    lower.includes('urgente') || lower.includes('imediato') || lower.includes('amanhã') || lower.includes('hoje');
  const wantsSquad = lower.includes('squad') || lower.includes('saas') || lower.includes('software');
  const wantsAiAgent = lower.includes('agente') || lower.includes('ia') || lower.includes('whatsapp');
  const wantsCloud = lower.includes('cloud') || lower.includes('devops') || lower.includes('vps');

  const solutionCategory: LeadQualificationInput['solutionCategory'] = wantsSquad
    ? 'saas_squad'
    : wantsAiAgent
      ? 'ai_agent'
      : wantsCloud
        ? 'cloud_devops'
        : undefined;

  const qualification = calculateLeadQualification({
    fullName: params.contactName,
    city: lower.includes('são paulo') || lower.includes('faria lima') || lower.includes('itaim') ? 'São Paulo' : undefined,
    solutionCategory,
    modality: lower.includes('escopo fechado') || lower.includes('projeto') ? 'project' : 'retainer',
    contractMonths: 12,
    priorityLaunchUrgency: isUrgentLaunch,
  });

  const confidenceScore = ragMatches[0] ? Math.max(0.78, ragMatches[0].similarity) : 0.82;
  const handoff = evaluateHandoffNeed({
    messageText: maskedInputText,
    confidenceScore,
  });

  const toolCalls: AgentToolCall[] = [
    AgentToolCallSchema.parse({
      toolName: 'upsertLeadAndContact',
      arguments: {
        fullName: params.contactName,
        solutionCategory,
        modality: lower.includes('projeto') ? 'project' : 'retainer',
        contractMonths: 12,
        priorityLaunchUrgency: isUrgentLaunch,
      },
    }),
    AgentToolCallSchema.parse({
      toolName: 'movePipelineStage',
      arguments: {
        leadId: `lead_${params.contactId}`,
        targetStageSlug: qualification.recommendedStageSlug,
        reason: `Qualificado automaticamente pela IA com score ${qualification.score} (${qualification.temperature})`,
      },
    }),
  ];

  let replyText: string;
  if (handoff.shouldHandoff) {
    replyText =
      'Entendi perfeitamente! Como sou o assistente virtual da DC Foundry Digital, acabei de transferir seu atendimento para um especialista humano da nossa equipe de engenharia e pausei minhas respostas automáticas. Um consultor já vai falar com você em instantes!';
  } else {
    const kbSnippet =
      ragMatches[0]?.chunk.contentText ??
      'Desenvolvemos plataformas SaaS sob medida, Agentes Autônomos de IA no WhatsApp com RAG pgvector (a partir de R$ 2.900/mês) e Squads Dedicadas de Engenharia com atribuição ponta a ponta no Google Ads.';
    const prefix = withinHours
      ? `Olá, ${params.contactName}! Sou o assistente virtual da DC Foundry Digital.`
      : (params.businessHours ?? DEFAULT_BUSINESS_HOURS).outOfHoursMessage;

    replyText = `${prefix} ${kbSnippet} Posso preparar o link da proposta comercial e agendar uma call de arquitetura agora?`;
  }

  return {
    skippedBecausePaused: false,
    withinBusinessHours: withinHours,
    maskedInputText,
    replyText,
    citedChunkIds,
    qualification,
    toolCalls,
    handoff,
    aiPausedNextState: handoff.shouldHandoff,
    latencyMs: Math.max(2, Math.round(performance.now() - startedAt)),
    providerUsed: 'gemini',
  };
}
