import React from 'react';

export interface BadgeProps {
  tone?: 'teal' | 'sky' | 'warm' | 'danger';
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ tone = 'sky', children }) => {
  const toneStyles: Record<NonNullable<BadgeProps['tone']>, React.CSSProperties> = {
    teal: {
      backgroundColor: 'var(--color-teal-100)',
      color: 'var(--color-teal-700)',
    },
    sky: {
      backgroundColor: 'var(--color-sky-100)',
      color: 'var(--color-brand-blue-dark)',
    },
    warm: {
      backgroundColor: 'var(--color-warm-bg)',
      color: 'var(--color-ink-soft)',
      border: '1px solid var(--color-warm-border)',
    },
    danger: {
      backgroundColor: '#FEE2E2',
      color: '#991B1B',
    },
  };

  return (
    <span
      className={`dcf-badge dcf-badge-${tone}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '9999px',
        fontSize: 'var(--text-xs)',
        fontWeight: 700,
        fontFamily: 'var(--font-sans)',
        ...toneStyles[tone],
      }}
    >
      {children}
    </span>
  );
};
