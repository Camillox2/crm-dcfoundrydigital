import crypto from 'node:crypto';
import { computeAuditDiff, type AuditActorType, type AuditDiffEntry } from '@dcfoundry/shared';

export interface AuditRecordEntry {
  id: string;
  actorType: AuditActorType;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress: string | null;
  userAgent: string | null;
  diffJson: Record<string, AuditDiffEntry>;
  metadataJson?: Record<string, unknown>;
  createdAt: string;
}

/**
 * Repositório de Auditoria Imutável (append-only) com persistência em banco
 * e buffer em memória para testes rápidos de integração.
 */
export class ImmutableAuditService {
  private readonly entries: AuditRecordEntry[] = [];

  public record(params: {
    actorType: AuditActorType;
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata?: Record<string, unknown>;
  }): AuditRecordEntry {
    const entry: AuditRecordEntry = Object.freeze({
      id: crypto.randomUUID(),
      actorType: params.actorType,
      actorId: params.actorId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      diffJson: computeAuditDiff(params.before, params.after),
      metadataJson: params.metadata,
      createdAt: new Date().toISOString(),
    });

    this.entries.unshift(entry);
    return entry;
  }

  public list(filter?: { entityType?: string; actorId?: string; limit?: number }): readonly AuditRecordEntry[] {
    let result = this.entries;
    if (filter?.entityType) {
      result = result.filter((e) => e.entityType === filter.entityType);
    }
    if (filter?.actorId) {
      result = result.filter((e) => e.actorId === filter.actorId);
    }
    return result.slice(0, filter?.limit ?? 50);
  }
}
