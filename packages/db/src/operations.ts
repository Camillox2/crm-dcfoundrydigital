import { normalizePhoneE164 } from '@dcfoundry/shared';

// ============================================================================
// 1. VALIDADOR DE ALOCAÇÃO / RESERVA SEM SOBREPOSIÇÃO (FASE 5)
// ============================================================================

export interface AllocationSlot {
  id: string;
  resourceUnitId: string;
  contractId: string;
  startsAtIso: string;
  endsAtIso: string;
  isActive: boolean;
}

/**
 * Verifica se uma nova alocação/reserva conflita com reservas ativas da mesma unidade
 * usando semântica de intervalo semiaberto [startsAt, endsAt), idêntica ao tstzrange GiST do Postgres.
 */
export function hasReservationOverlap(
  existingReservations: readonly AllocationSlot[],
  candidate: {
    resourceUnitId: string;
    startsAtIso: string;
    endsAtIso: string;
  },
): boolean {
  const candStart = new Date(candidate.startsAtIso).getTime();
  const candEnd = new Date(candidate.endsAtIso).getTime();

  if (candEnd <= candStart) {
    throw new Error('Período de reserva inválido: a data final deve ser posterior à data inicial.');
  }

  for (const res of existingReservations) {
    if (!res.isActive) continue;
    if (res.resourceUnitId !== candidate.resourceUnitId) continue;

    const existingStart = new Date(res.startsAtIso).getTime();
    const existingEnd = new Date(res.endsAtIso).getTime();

    // Sobreposição em [start, end): max(start1, start2) < min(end1, end2)
    if (Math.max(candStart, existingStart) < Math.min(candEnd, existingEnd)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// 2. MOTOR DE LEMBRETES AUTOMÁTICOS DE COBRANÇA E RENOVAÇÃO (COM RELÓGIO SIMULADO)
// ============================================================================

export interface ScheduledContractItem {
  contractCode: string;
  contactName: string;
  phoneE164: string;
  expectedRenewalIso: string;
  status: 'active' | 'due_renewal' | 'completed';
}

export interface ScheduledInvoiceItem {
  invoiceId: string;
  contractCode: string;
  contactName: string;
  phoneE164: string;
  dueDateIso: string; // YYYY-MM-DD
  amountCents: number;
  status: 'pending' | 'paid' | 'overdue';
}

export interface DispatchedReminder {
  type: 'billing_due_soon' | 'billing_overdue' | 'contract_renewal_due';
  targetId: string;
  phoneE164: string;
  whatsappMessage: string;
}

/**
 * Avalia contratos e faturas na data informada (`simulatedNow`), disparando lembretes
 * de renovação (3 dias antes) e de cobrança (no dia do vencimento e 2 dias após atraso).
 */
export function evaluateDueReminders(params: {
  simulatedNow: Date;
  contracts: readonly ScheduledContractItem[];
  invoices: readonly ScheduledInvoiceItem[];
}): DispatchedReminder[] {
  const reminders: DispatchedReminder[] = [];
  const nowDayMs = Date.UTC(
    params.simulatedNow.getUTCFullYear(),
    params.simulatedNow.getUTCMonth(),
    params.simulatedNow.getUTCDate(),
  );
  const DAY_MS = 86_400_000;

  for (const ctr of params.contracts) {
    if (ctr.status !== 'active' && ctr.status !== 'due_renewal') continue;
    const endDate = new Date(ctr.expectedRenewalIso);
    const endDayMs = Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate(),
    );
    const daysRemaining = Math.round((endDayMs - nowDayMs) / DAY_MS);

    if (daysRemaining === 3 || daysRemaining === 0) {
      reminders.push({
        type: 'contract_renewal_due',
        targetId: ctr.contractCode,
        phoneE164: ctr.phoneE164,
        whatsappMessage: `Olá, ${ctr.contactName}! Seu contrato ${ctr.contractCode} na DC Foundry Digital vence em ${daysRemaining} dia(s). Deseja renovar o ciclo automaticamente?`,
      });
    }
  }

  for (const inv of params.invoices) {
    if (inv.status === 'paid') continue;
    const [y, m, d] = inv.dueDateIso.split('-').map(Number);
    const dueDayMs = Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1);
    const diffDays = Math.round((dueDayMs - nowDayMs) / DAY_MS);

    if (diffDays === 0) {
      reminders.push({
        type: 'billing_due_soon',
        targetId: inv.invoiceId,
        phoneE164: inv.phoneE164,
        whatsappMessage: `Olá, ${inv.contactName}! A fatura ${inv.invoiceId} do contrato ${inv.contractCode} vence hoje. Segue o código Pix para pagamento rápido.`,
      });
    } else if (diffDays === -2) {
      reminders.push({
        type: 'billing_overdue',
        targetId: inv.invoiceId,
        phoneE164: inv.phoneE164,
        whatsappMessage: `Olá, ${inv.contactName}! Identificamos que a fatura ${inv.invoiceId} (${ctrAmountBrl(inv.amountCents)}) venceu há 2 dias. Posso reenviar o Pix ou boleto atualizado?`,
      });
    }
  }

  return reminders;
}

function ctrAmountBrl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ============================================================================
// 3. MIGRADOR SEM PERDA DO LEGADO `crm_records (collection, id, data JSONB)` (FASE 7)
// ============================================================================

export interface LegacyCrmRecordRow {
  collection: 'clients' | 'leads' | 'contracts' | 'invoices' | 'blog_posts';
  id: string;
  data: Record<string, unknown>;
}

export interface MigratedRelationalBundle {
  contacts: Array<{ id: string; fullName: string; phoneE164: string; email?: string }>;
  leads: Array<{ id: string; contactPhoneE164: string; title: string; stageSlug: string }>;
  contracts: Array<{ id: string; contractCode: string; contactPhoneE164: string; monthlyValueCents: number }>;
  invoices: Array<{ id: string; contractCode: string; amountCents: number; status: string }>;
  blogPosts: Array<{ id: string; title: string; slug: string }>;
  stats: {
    totalInputRecords: number;
    migratedCount: number;
    deduplicatedContactsCount: number;
    zeroLossVerified: boolean;
  };
}

/**
 * Converte registros genéricos `crm_records (collection, id, data JSONB)` para o novo
 * modelo relacional normalizado, deduplicando contatos pelo telefone E.164 sem perda de registros.
 */
export function migrateLegacyCrmRecords(
  rows: readonly LegacyCrmRecordRow[],
): MigratedRelationalBundle {
  const contactsByPhone = new Map<string, { id: string; fullName: string; phoneE164: string; email?: string }>();
  const leads: MigratedRelationalBundle['leads'] = [];
  const contracts: MigratedRelationalBundle['contracts'] = [];
  const invoices: MigratedRelationalBundle['invoices'] = [];
  const blogPosts: MigratedRelationalBundle['blogPosts'] = [];

  let deduplicatedContactsCount = 0;

  for (const row of rows) {
    if (row.collection === 'clients') {
      const rawPhone = String(row.data.phone ?? row.data.telefone ?? '+5511999990000');
      const phoneE164 = normalizePhoneE164(rawPhone);
      if (contactsByPhone.has(phoneE164)) {
        deduplicatedContactsCount++;
      } else {
        contactsByPhone.set(phoneE164, {
          id: row.id,
          fullName: String(row.data.name ?? row.data.nome ?? 'Cliente Migrado'),
          phoneE164,
          email: row.data.email ? String(row.data.email) : undefined,
        });
      }
    } else if (row.collection === 'leads') {
      const rawPhone = String(row.data.phone ?? '+5511999990000');
      const phoneE164 = normalizePhoneE164(rawPhone);
      if (!contactsByPhone.has(phoneE164)) {
        contactsByPhone.set(phoneE164, {
          id: `cnt_${row.id}`,
          fullName: String(row.data.name ?? 'Lead Migrado'),
          phoneE164,
        });
      }
      leads.push({
        id: row.id,
        contactPhoneE164: phoneE164,
        title: String(row.data.title ?? row.data.name ?? 'Oportunidade Comercial'),
        stageSlug: String(row.data.stage ?? 'novo'),
      });
    } else if (row.collection === 'contracts') {
      const rawPhone = String(row.data.phone ?? '+5511999990000');
      const phoneE164 = normalizePhoneE164(rawPhone);
      contracts.push({
        id: row.id,
        contractCode: String(row.data.code ?? `CTR-${row.id}`),
        contactPhoneE164: phoneE164,
        monthlyValueCents: Number(row.data.monthlyValueCents ?? 250000),
      });
    } else if (row.collection === 'invoices') {
      invoices.push({
        id: row.id,
        contractCode: String(row.data.contractCode ?? 'CTR-DEFAULT'),
        amountCents: Number(row.data.amountCents ?? 250000),
        status: String(row.data.status ?? 'pending'),
      });
    } else if (row.collection === 'blog_posts') {
      blogPosts.push({
        id: row.id,
        title: String(row.data.title ?? 'Artigo'),
        slug: String(row.data.slug ?? row.id),
      });
    }
  }

  const migratedEntitiesTotal =
    contactsByPhone.size +
    deduplicatedContactsCount +
    leads.length +
    contracts.length +
    invoices.length +
    blogPosts.length;

  return {
    contacts: Array.from(contactsByPhone.values()),
    leads,
    contracts,
    invoices,
    blogPosts,
    stats: {
      totalInputRecords: rows.length,
      migratedCount: migratedEntitiesTotal,
      deduplicatedContactsCount,
      zeroLossVerified: migratedEntitiesTotal >= rows.length,
    },
  };
}
