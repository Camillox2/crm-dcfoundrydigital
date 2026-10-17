import type { ReactNode } from 'react';

export function Notice({ tone = 'ok', children }: { tone?: 'ok' | 'warn' | 'error'; children: ReactNode }) {
  return (
    <p className={`dcf-notice is-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
