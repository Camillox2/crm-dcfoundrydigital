import React, { useEffect, useState } from 'react';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const span = (t: number, from: number, to: number) => ease(clamp01((t - from) / (to - from)));

function demoPose(t: number) {
  const down = span(t, 0.8, 0.95);
  return {
    back: span(t, 0.04, 0.22) * (1 - down),
    legs: span(t, 0.3, 0.44) * (1 - down),
    lift: span(t, 0.52, 0.68) * (1 - down),
  };
}

const DEMO_MS = 9000;
const REST = { back: 0.6, legs: 0.3, lift: 0.3 };

/**
 * 1. Cama hospitalar em vetor articulando sozinha (encosto, pernas e elevação)
 */
export const BedArt: React.FC<{ className?: string; style?: React.CSSProperties }> = ({
  className,
  style,
}) => {
  const [pose, setPose] = useState(REST);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      setPose(demoPose(((now - started) % DEMO_MS) / DEMO_MS));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const backDeg = pose.back * 62;
  const legsDeg = pose.legs * 30;
  const rise = pose.lift * 58;
  const py = 300 - rise;

  const frame = '#c4d3e6';
  const metal = '#8fb8e8';
  const base = '#dce9f8';

  return (
    <svg
      className={className}
      style={style}
      viewBox="78 40 484 372"
      role="img"
      aria-label="Ilustração de cama hospitalar motorizada articulando encosto, pernas e altura"
    >
      <ellipse
        cx="320"
        cy="396"
        rx={236 - rise * 0.5}
        ry="9"
        fill="#000"
        opacity={0.22 - pose.lift * 0.06}
      />

      <rect x="150" y="346" width="340" height="12" rx="6" fill={base} />
      {[176, 464].map((cx) => (
        <g key={cx}>
          <rect x={cx - 4} y="356" width="8" height="10" fill={base} />
          <circle cx={cx} cy="378" r="13" fill={base} />
          <circle cx={cx} cy="378" r="5" fill="#102a4c" />
        </g>
      ))}

      <g stroke={metal} strokeWidth="9" strokeLinecap="round">
        <line x1="206" y1="346" x2="434" y2={py + 16} />
        <line x1="434" y1="346" x2="206" y2={py + 16} />
      </g>
      <circle cx="320" cy={(346 + py + 16) / 2} r="7" fill={base} />

      <rect x="118" y={py + 8} width="404" height="10" rx="5" fill={metal} />
      <rect x="100" y={py - 84} width="18" height="104" rx="9" fill="#fffdf9" />
      <rect x="522" y={py - 54} width="18" height="74" rx="9" fill="#fffdf9" />

      <rect x="292" y={py - 28} width="80" height="28" fill="#1D5FAE" />
      <rect x="292" y={py} width="80" height="7" fill={frame} />

      <g transform={`rotate(${-legsDeg} 373 ${py})`}>
        <rect x="374" y={py - 28} width="72" height="28" fill="#4f93e0" />
        <rect x="374" y={py} width="72" height="7" fill={frame} />
        <g transform={`rotate(${legsDeg * 0.9} 447 ${py})`}>
          <rect x="448" y={py - 28} width="72" height="28" fill="#1D5FAE" />
          <path d={`M506 ${py - 28} h4 a10 10 0 0 1 10 10 v18 h-14 z`} fill="#1D5FAE" />
          <rect x="448" y={py} width="72" height="7" fill={frame} />
        </g>
      </g>

      <g transform={`rotate(${backDeg} 291 ${py})`}>
        <rect x="124" y={py} width="166" height="7" fill={frame} />
        <path d={`M134 ${py - 28} h156 v28 h-166 v-18 a10 10 0 0 1 10 -10 z`} fill="#4f93e0" />
        <rect x="136" y={py - 46} width="78" height="22" rx="11" fill="#fffdf9" />
        <g fill="none" stroke={metal} strokeWidth="6" strokeLinecap="round">
          <rect x="178" y={py - 78} width="100" height="40" rx="12" />
          <line x1="212" y1={py - 78} x2="212" y2={py - 38} />
          <line x1="244" y1={py - 78} x2="244" y2={py - 38} />
        </g>
      </g>
    </svg>
  );
};

/**
 * 2. Ilustração vetorial animada de Logística (Entrega / Retirada Home Care)
 */
export const DeliveryArt: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg
    viewBox="0 0 220 110"
    style={{ width: 150, height: 76, ...style }}
    role="img"
    aria-label="Ilustração vetorial de veículo de entrega e retirada hospitalar"
  >
    <line x1="12" y1="92" x2="208" y2="92" stroke="#D6DFE7" strokeWidth="4" strokeLinecap="round" />
    <g style={{ animation: 'dcf-float 3.2s ease-in-out infinite' }}>
      <rect x="28" y="26" width="108" height="54" rx="12" fill="#1D5FAE" />
      <path d="M136 40 H172 L188 60 V80 H136 Z" fill="#102A4C" />
      <rect x="144" y="46" width="24" height="14" rx="4" fill="#DCE9F8" />
      {/* Cruz de saúde / home care */}
      <rect x="74" y="41" width="16" height="6" rx="2" fill="#FFFDF9" />
      <rect x="79" y="36" width="6" height="16" rx="2" fill="#FFFDF9" />
    </g>
    <circle cx="62" cy="84" r="12" fill="#0A1D35" stroke="#DCE9F8" strokeWidth="4" />
    <circle cx="162" cy="84" r="12" fill="#0A1D35" stroke="#DCE9F8" strokeWidth="4" />
  </svg>
);

/**
 * 3. Ilustração vetorial animada de Contrato Assinado Eletronicamente
 */
export const ContractSignedArt: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg
    viewBox="0 0 180 120"
    style={{ width: 132, height: 88, ...style }}
    role="img"
    aria-label="Ilustração de contrato assinado com selo de verificação"
  >
    <rect x="34" y="10" width="96" height="100" rx="12" fill="#FFFDF9" stroke="#D6DFE7" strokeWidth="3" />
    <line x1="50" y1="32" x2="110" y2="32" stroke="#DCE9F8" strokeWidth="6" strokeLinecap="round" />
    <line x1="50" y1="48" x2="102" y2="48" stroke="#DCE9F8" strokeWidth="6" strokeLinecap="round" />
    <line x1="50" y1="64" x2="90" y2="64" stroke="#DCE9F8" strokeWidth="6" strokeLinecap="round" />
    <path
      d="M50 86 Q 65 72, 76 86 T 106 82"
      fill="none"
      stroke="#1D5FAE"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeDasharray="120"
      strokeDashoffset="0"
    />
    <circle cx="128" cy="84" r="20" fill="#0F766E" />
    <path
      d="M119 84 L125 90 L138 77"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * 4. Traço editorial desenhado à mão sob palavras-chave (<Mark>...</Mark>)
 */
export const Mark: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="dcf-mark">
    {children}
    <svg viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true">
      <path d="M3 10 Q 98 3 197 9" />
    </svg>
  </span>
);
