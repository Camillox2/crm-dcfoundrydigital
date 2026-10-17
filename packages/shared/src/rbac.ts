import { z } from 'zod';

export const ROLES = [
  'admin',
  'gestor',
  'vendedor',
  'atendente',
  'financeiro',
  'logistica',
  'marketing',
] as const;

export type RoleName = (typeof ROLES)[number];

export const SCOPES = ['own', 'team', 'all'] as const;
export type AccessScope = (typeof SCOPES)[number];

export const RESOURCES = [
  'lead',
  'contact',
  'pipeline',
  'task',
  'whatsapp',
  'ai_agent',
  'product',
  'equipment',
  'quote',
  'contract',
  'logistics',
  'finance',
  'marketing_ads',
  'blog',
  'user',
  'audit_log',
  'settings',
] as const;

export type ResourceName = (typeof RESOURCES)[number];

export const ACTIONS = [
  'read',
  'create',
  'update',
  'delete',
  'approve',
  'export',
  'manage',
] as const;

export type ActionName = (typeof ACTIONS)[number];

export type PermissionKey = `${ResourceName}:${ActionName}`;

export interface PermissionGrant {
  permission: PermissionKey;
  scope: AccessScope;
}

const SCOPE_RANK: Record<AccessScope, number> = {
  own: 1,
  team: 2,
  all: 3,
};

/**
 * Matriz de permissões padrão por papel no DC Foundry Digital CRM
 */
export const ROLE_PERMISSIONS_MATRIX: Record<RoleName, PermissionGrant[]> = {
  admin: RESOURCES.flatMap((res) =>
    ACTIONS.map((act) => ({
      permission: `${res}:${act}` as PermissionKey,
      scope: 'all' as AccessScope,
    })),
  ),
  gestor: [
    { permission: 'lead:read', scope: 'all' },
    { permission: 'lead:create', scope: 'all' },
    { permission: 'lead:update', scope: 'all' },
    { permission: 'lead:export', scope: 'all' },
    { permission: 'contact:read', scope: 'all' },
    { permission: 'contact:create', scope: 'all' },
    { permission: 'contact:update', scope: 'all' },
    { permission: 'pipeline:read', scope: 'all' },
    { permission: 'pipeline:manage', scope: 'all' },
    { permission: 'task:read', scope: 'all' },
    { permission: 'task:create', scope: 'all' },
    { permission: 'task:update', scope: 'all' },
    { permission: 'whatsapp:read', scope: 'all' },
    { permission: 'whatsapp:create', scope: 'all' },
    { permission: 'whatsapp:manage', scope: 'all' },
    { permission: 'ai_agent:read', scope: 'all' },
    { permission: 'ai_agent:update', scope: 'all' },
    { permission: 'product:read', scope: 'all' },
    { permission: 'equipment:read', scope: 'all' },
    { permission: 'quote:read', scope: 'all' },
    { permission: 'quote:create', scope: 'all' },
    { permission: 'quote:approve', scope: 'all' },
    { permission: 'contract:read', scope: 'all' },
    { permission: 'contract:create', scope: 'all' },
    { permission: 'contract:approve', scope: 'all' },
    { permission: 'logistics:read', scope: 'all' },
    { permission: 'finance:read', scope: 'all' },
    { permission: 'marketing_ads:read', scope: 'all' },
    { permission: 'audit_log:read', scope: 'team' },
  ],
  vendedor: [
    { permission: 'lead:read', scope: 'own' },
    { permission: 'lead:create', scope: 'own' },
    { permission: 'lead:update', scope: 'own' },
    { permission: 'contact:read', scope: 'all' },
    { permission: 'contact:create', scope: 'own' },
    { permission: 'contact:update', scope: 'own' },
    { permission: 'pipeline:read', scope: 'all' },
    { permission: 'task:read', scope: 'own' },
    { permission: 'task:create', scope: 'own' },
    { permission: 'task:update', scope: 'own' },
    { permission: 'whatsapp:read', scope: 'own' },
    { permission: 'whatsapp:create', scope: 'own' },
    { permission: 'product:read', scope: 'all' },
    { permission: 'equipment:read', scope: 'all' },
    { permission: 'quote:read', scope: 'own' },
    { permission: 'quote:create', scope: 'own' },
    { permission: 'quote:update', scope: 'own' },
    { permission: 'contract:read', scope: 'own' },
    { permission: 'contract:create', scope: 'own' },
  ],
  atendente: [
    { permission: 'lead:read', scope: 'team' },
    { permission: 'lead:create', scope: 'own' },
    { permission: 'lead:update', scope: 'team' },
    { permission: 'contact:read', scope: 'all' },
    { permission: 'contact:create', scope: 'own' },
    { permission: 'contact:update', scope: 'team' },
    { permission: 'pipeline:read', scope: 'all' },
    { permission: 'task:read', scope: 'own' },
    { permission: 'task:create', scope: 'own' },
    { permission: 'whatsapp:read', scope: 'all' },
    { permission: 'whatsapp:create', scope: 'all' },
    { permission: 'whatsapp:update', scope: 'all' },
    { permission: 'ai_agent:read', scope: 'all' },
    { permission: 'product:read', scope: 'all' },
    { permission: 'equipment:read', scope: 'all' },
  ],
  financeiro: [
    { permission: 'contact:read', scope: 'all' },
    { permission: 'contract:read', scope: 'all' },
    { permission: 'contract:approve', scope: 'all' },
    { permission: 'finance:read', scope: 'all' },
    { permission: 'finance:create', scope: 'all' },
    { permission: 'finance:update', scope: 'all' },
    { permission: 'finance:export', scope: 'all' },
    { permission: 'whatsapp:read', scope: 'team' },
    { permission: 'whatsapp:create', scope: 'own' },
  ],
  logistica: [
    { permission: 'contact:read', scope: 'all' },
    { permission: 'contract:read', scope: 'all' },
    { permission: 'product:read', scope: 'all' },
    { permission: 'equipment:read', scope: 'all' },
    { permission: 'equipment:update', scope: 'all' },
    { permission: 'logistics:read', scope: 'all' },
    { permission: 'logistics:create', scope: 'all' },
    { permission: 'logistics:update', scope: 'all' },
  ],
  marketing: [
    { permission: 'lead:read', scope: 'all' },
    { permission: 'pipeline:read', scope: 'all' },
    { permission: 'marketing_ads:read', scope: 'all' },
    { permission: 'marketing_ads:create', scope: 'all' },
    { permission: 'marketing_ads:update', scope: 'all' },
    { permission: 'marketing_ads:export', scope: 'all' },
    { permission: 'blog:read', scope: 'all' },
    { permission: 'blog:create', scope: 'all' },
    { permission: 'blog:update', scope: 'all' },
    { permission: 'blog:delete', scope: 'all' },
  ],
};

export interface RbacSubject {
  userId: string;
  teamId?: string | null;
  roles: RoleName[];
}

export interface RbacResourceTarget {
  ownerId?: string | null;
  teamId?: string | null;
}

/**
 * Resolve o maior escopo concedido a um usuário para uma determinada permissão.
 */
export function resolveGrantedScope(
  roles: readonly RoleName[],
  permission: PermissionKey,
): AccessScope | null {
  let highest: AccessScope | null = null;

  for (const role of roles) {
    const grants = ROLE_PERMISSIONS_MATRIX[role] ?? [];
    for (const grant of grants) {
      if (grant.permission === permission) {
        if (!highest || SCOPE_RANK[grant.scope] > SCOPE_RANK[highest]) {
          highest = grant.scope;
        }
      }
    }
  }

  return highest;
}

/**
 * Avalia se o sujeito possui permissão e escopo suficientes sobre o recurso alvo.
 */
export function canAccess(
  subject: RbacSubject,
  permission: PermissionKey,
  target?: RbacResourceTarget,
): boolean {
  const scope = resolveGrantedScope(subject.roles, permission);
  if (!scope) return false;
  if (scope === 'all') return true;
  if (!target) return true;

  if (scope === 'team') {
    if (target.ownerId && target.ownerId === subject.userId) return true;
    if (subject.teamId && target.teamId && subject.teamId === target.teamId) return true;
    return false;
  }

  // scope === 'own'
  return Boolean(target.ownerId && target.ownerId === subject.userId);
}

export const RoleSchema = z.enum(ROLES);
export const ScopeSchema = z.enum(SCOPES);
