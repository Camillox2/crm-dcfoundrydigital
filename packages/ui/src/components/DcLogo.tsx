import React, { useState } from 'react';

export interface DcLogoProps {
  size?: number;
  showText?: boolean;
  subtitle?: string;
  className?: string;
  logoSrc?: string;
}

/**
 * Componente oficial de marca do DC Foundry Digital CRM,
 * usando a logo oficial (/logosemfundonova.png de dcfoundrydigital.com)
 * com fallback vetorial de alta precisão caso o asset não esteja carregado.
 */
export const DcLogo: React.FC<DcLogoProps> = ({
  size = 40,
  showText = true,
  subtitle = 'CRM',
  className = '',
  logoSrc = '/logosemfundonova.png',
}) => {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={`inline-flex items-center gap-3 select-none ${className}`}
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {!imgError ? (
        <img
          src={logoSrc}
          alt="DC Foundry Digital"
          width={size}
          height={size}
          onError={() => setImgError(true)}
          style={{
            width: size,
            height: size,
            objectFit: 'contain',
          }}
        />
      ) : (
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          role="img"
          aria-label="DC Foundry Digital"
        >
          <path
            d="M10 14 H28 A18 18 0 0 1 46 32 A18 18 0 0 1 28 50 H10 V22 M18 22 V42 H27 A10 10 0 0 0 37 32 A10 10 0 0 0 27 22 Z"
            fill="none"
            stroke="#0047FF"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M54 21 A16 16 0 0 0 32 32 A16 16 0 0 0 54 43"
            fill="none"
            stroke="#0047FF"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        </svg>
      )}

      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span
            style={{
              fontWeight: 800,
              fontSize: '1.05rem',
              letterSpacing: '-0.02em',
              color: 'inherit',
            }}
          >
            DCFoundry<span style={{ color: '#3B82F6' }}>Digital</span>
          </span>
          {subtitle && (
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
