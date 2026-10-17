import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'default' | 'warm' | 'navy';
}

export const Card: React.FC<CardProps> = ({
  tone = 'default',
  children,
  style,
  className = '',
  ...rest
}) => {
  const toneMap: Record<NonNullable<CardProps['tone']>, React.CSSProperties> = {
    default: {
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border-default)',
      color: 'var(--text-primary)',
    },
    warm: {
      backgroundColor: 'var(--color-warm-card)',
      border: '1px solid var(--color-warm-border)',
      color: 'var(--color-ink)',
    },
    navy: {
      backgroundColor: 'var(--color-navy-900)',
      border: '1px solid var(--color-navy-700)',
      color: '#FFFFFF',
    },
  };

  return (
    <div
      className={`dcf-card dcf-card-${tone} ${className}`}
      style={{
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-6)',
        boxShadow: 'var(--shadow-card)',
        ...toneMap[tone],
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
};
