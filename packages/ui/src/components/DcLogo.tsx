import React from 'react';

export interface DcLogoProps {
  size?: number;
  showText?: boolean;
  subtitle?: string;
  className?: string;
  logoSrc?: string;
}

/** Original DC monogram and the same wordmark used by dcfoundrydigital.com. */
export const DcLogo: React.FC<DcLogoProps> = ({
  size = 40,
  showText = true,
  subtitle = 'CRM',
  className = '',
  logoSrc = '/logosemfundonova.png',
}) => {
  return (
    <div
      className={`dcf-logo ${className}`}
      aria-label="DC Foundry Digital"
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      <span className="dcf-logo-symbol" style={{ width: size, height: size }}>
        <img
          src={logoSrc}
          alt={showText ? '' : 'DC Foundry Digital'}
          width={size}
          height={size}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />
      </span>

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
            Foundry<span className="dcf-logo-accent"> Digital</span>
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
