import React from 'react';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 18,
  borderRadius = 'var(--radius-sm)',
  style,
}) => (
  <div
    className="dcf-skeleton"
    aria-hidden="true"
    style={{
      width,
      height,
      borderRadius,
      ...style,
    }}
  />
);

export const KpiCardSkeleton: React.FC = () => (
  <div
    style={{
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-6)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)',
    }}
    role="status"
    aria-label="Carregando indicador"
  >
    <Skeleton width="45%" height={14} />
    <Skeleton width="70%" height={32} />
    <Skeleton width="55%" height={12} />
  </div>
);

export const TableListSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div
    style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
    role="status"
    aria-label="Carregando lista"
  >
    {Array.from({ length: rows }).map((_, idx) => (
      <div
        key={idx}
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 120px',
          gap: 'var(--space-4)',
          padding: 'var(--space-4)',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <Skeleton height={18} />
        <Skeleton height={18} />
        <Skeleton height={18} />
        <Skeleton height={18} />
      </div>
    ))}
  </div>
);
