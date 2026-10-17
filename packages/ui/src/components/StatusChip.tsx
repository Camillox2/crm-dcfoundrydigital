import type { ReactNode } from 'react';

export function StatusChip({
  tone = 'neutral',
  children,
}: {
  tone?: 'ok' | 'wait' | 'late' | 'neutral';
  children: ReactNode;
}) {
  return <span className={`dcf-status is-${tone}`}>{children}</span>;
}
