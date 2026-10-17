import React from 'react';
import {
  canAccess,
  type PermissionKey,
  type RbacResourceTarget,
  type RbacSubject,
} from '@dcfoundry/shared';

export interface PermissionGateProps {
  subject: RbacSubject | null;
  permission: PermissionKey;
  target?: RbacResourceTarget;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Oculta elementos da interface quando o usuário autenticado não possui
 * a permissão ou escopo exigido pelo RBAC.
 */
export const PermissionGate: React.FC<PermissionGateProps> = ({
  subject,
  permission,
  target,
  fallback = null,
  children,
}) => {
  if (!subject) return <>{fallback}</>;
  const allowed = canAccess(subject, permission, target);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
};
