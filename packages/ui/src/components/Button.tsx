import React, { useState } from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'teal' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  haptic?: boolean;
}

interface RippleItem {
  id: number;
  x: number;
  y: number;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  haptic = true,
  onClick,
  children,
  style,
  disabled,
  className = '',
  ...rest
}) => {
  const [ripples, setRipples] = useState<RippleItem[]>([]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const id = Date.now() + Math.random();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setRipples((prev) => [...prev, { id, x, y }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 550);

    if (haptic && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(10);
      } catch {
        // Ignora caso bloqueado
      }
    }
    onClick?.(e);
  };

  const variantStyles: Record<NonNullable<ButtonProps['variant']>, React.CSSProperties> = {
    primary: {
      backgroundColor: 'var(--brand-primary)',
      color: '#FFFFFF',
      border: '1px solid var(--brand-primary)',
      boxShadow: 'var(--shadow-primary-btn)',
    },
    teal: {
      backgroundColor: 'var(--color-teal-700)',
      color: '#FFFFFF',
      border: '1px solid var(--color-teal-700)',
      boxShadow: '0 10px 22px -10px rgba(15, 118, 110, 0.65)',
    },
    outline: {
      backgroundColor: 'var(--bg-card)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-strong)',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--text-secondary)',
      border: '1px solid transparent',
    },
    danger: {
      backgroundColor: '#DC2626',
      color: '#FFFFFF',
      border: '1px solid #DC2626',
    },
  };

  const sizeStyles: Record<NonNullable<ButtonProps['size']>, React.CSSProperties> = {
    sm: {
      padding: '7px 14px',
      fontSize: 'var(--text-xs)',
      borderRadius: 'var(--radius-sm)',
    },
    md: {
      padding: '10px 18px',
      fontSize: 'var(--text-sm)',
      borderRadius: 'var(--radius-sm)',
    },
    lg: {
      padding: '13px 24px',
      fontSize: 'var(--text-base)',
      borderRadius: 'var(--radius-md)',
    },
  };

  return (
    <button
      className={`dcf-button dcf-button-${variant} dcf-button-${size} ${className}`}
      onClick={handleClick}
      disabled={disabled}
      style={{
        position: 'relative',
        overflow: 'hidden',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition:
          'transform 160ms cubic-bezier(0.22, 1, 0.36, 1), background-color 160ms ease, box-shadow 200ms ease',
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      }}
      {...rest}
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: r.x - 16,
            top: r.y - 16,
            width: 32,
            height: 32,
            borderRadius: '9999px',
            backgroundColor: 'rgba(255, 255, 255, 0.45)',
            pointerEvents: 'none',
            animation: 'dcf-ripple 520ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
          }}
        />
      ))}
      <span
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        {children}
      </span>
    </button>
  );
};
