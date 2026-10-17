import { z } from 'zod';

export const AUDIT_ACTOR_TYPES = ['user', 'ai_agent', 'system', 'webhook'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AuditLogQuerySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  actorId: z.string().uuid().optional(),
  actorType: z.enum(AUDIT_ACTOR_TYPES).optional(),
  action: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

const REDACTED_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'totpSecret',
  'totp_secret',
  'refreshToken',
  'refreshTokenHash',
  'accessToken',
  'ciphertext',
  'authTag',
]);

export interface AuditDiffEntry {
  before: unknown;
  after: unknown;
}

/**
 * Calcula o diff imutável (antes/depois) entre dois estados de uma entidade,
 * redactando automaticamente campos de credenciais/segredos.
 */
export function computeAuditDiff(
  beforeState: Record<string, unknown> | null | undefined,
  afterState: Record<string, unknown> | null | undefined,
): Record<string, AuditDiffEntry> {
  const beforeObj = beforeState ?? {};
  const afterObj = afterState ?? {};
  const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
  const diff: Record<string, AuditDiffEntry> = {};

  for (const key of allKeys) {
    if (REDACTED_KEYS.has(key)) {
      if (beforeObj[key] !== afterObj[key]) {
        diff[key] = { before: '[REDACTED]', after: '[REDACTED]' };
      }
      continue;
    }

    const prevVal = beforeObj[key] ?? null;
    const nextVal = afterObj[key] ?? null;

    if (JSON.stringify(prevVal) !== JSON.stringify(nextVal)) {
      diff[key] = { before: prevVal, after: nextVal };
    }
  }

  return diff;
}
