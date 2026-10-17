import React, { useEffect, useState } from 'react';

/**
 * 1. Ilustração vetorial animada principal da DC Foundry Digital:
 * Arquitetura distribuída de Engenharia de Software, Agentes de IA (RAG) e Atribuição de Receita.
 * 100% SVG puro, respeitando prefers-reduced-motion.
 */
export const FoundryArchitectureArt: React.FC<{
  className?: string;
  style?: React.CSSProperties;
}> = ({ className, style }) => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return undefined;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setPhase(((now - start) % 8000) / 8000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const pulseY = Math.sin(phase * Math.PI * 2) * 8;
  const pulseSecondary = Math.cos(phase * Math.PI * 2) * 6;
  const packetProgress = (phase * 2) % 1;

  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 560 340"
      role="img"
      aria-label="Arquitetura vetorial DC Foundry Digital — Engenharia de Software, IA e Atribuição"
    >
      <defs>
        <linearGradient id="dcf-node-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1D5FAE" />
          <stop offset="100%" stopColor="#0F766E" />
        </linearGradient>
        <linearGradient id="dcf-card-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#123B63" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#0A1D35" stopOpacity="0.95" />
        </linearGradient>
        <radialGradient id="dcf-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1D5FAE" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#061528" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Halo de luz de fundo */}
      <circle cx="280" cy="170" r="155" fill="url(#dcf-glow)" />

      {/* Grade arquitetônica sutil */}
      <g stroke="#123B63" strokeWidth="1" opacity="0.55">
        <line x1="60" y1="70" x2="500" y2="70" strokeDasharray="4 6" />
        <line x1="60" y1="170" x2="500" y2="170" strokeDasharray="4 6" />
        <line x1="60" y1="270" x2="500" y2="270" strokeDasharray="4 6" />
        <line x1="150" y1="30" x2="150" y2="310" strokeDasharray="4 6" />
        <line x1="280" y1="30" x2="280" y2="310" strokeDasharray="4 6" />
        <line x1="410" y1="30" x2="410" y2="310" strokeDasharray="4 6" />
      </g>

      {/* Trilhas de conexão entre os módulos */}
      <g fill="none" stroke="#1D5FAE" strokeWidth="2.5" opacity="0.75">
        <path d="M 140 110 C 200 110, 210 170, 280 170" />
        <path d="M 140 230 C 200 230, 210 170, 280 170" />
        <path d="M 280 170 C 350 170, 360 110, 420 110" />
        <path d="M 280 170 C 350 170, 360 230, 420 230" />
      </g>

      {/* Pacotes de dados viajando pelas trilhas */}
      <circle
        cx={140 + packetProgress * 140}
        cy={110 + Math.sin(packetProgress * Math.PI) * 30}
        r="4.5"
        fill="#DEF3EF"
      />
      <circle
        cx={280 + packetProgress * 140}
        cy={170 - Math.sin(packetProgress * Math.PI) * 30}
        r="4.5"
        fill="#DCE9F8"
      />

      {/* NÓ ESQUERDO SUPERIOR: Captura Ads & Tracking (UTM / gclid) */}
      <g transform={`translate(56, ${74 + pulseSecondary})`}>
        <rect width="124" height="68" rx="14" fill="url(#dcf-card-grad)" stroke="#1D5FAE" strokeWidth="1.5" />
        <circle cx="24" cy="24" r="8" fill="#1D5FAE" />
        <rect x="40" y="18" width="64" height="6" rx="3" fill="#DCE9F8" />
        <rect x="40" y="30" width="44" height="5" rx="2.5" fill="#667789" />
        <rect x="16" y="46" width="92" height="8" rx="4" fill="#0D2B4C" />
        <rect x="16" y="46" width="68" height="8" rx="4" fill="#12847B" />
      </g>

      {/* NÓ ESQUERDO INFERIOR: WhatsApp Multi-Sessão & Áudio Whisper */}
      <g transform={`translate(56, ${196 - pulseSecondary})`}>
        <rect width="124" height="68" rx="14" fill="url(#dcf-card-grad)" stroke="#12847B" strokeWidth="1.5" />
        <circle cx="24" cy="24" r="8" fill="#0F766E" />
        <rect x="40" y="18" width="58" height="6" rx="3" fill="#DEF3EF" />
        <rect x="40" y="30" width="48" height="5" rx="2.5" fill="#667789" />
        {/* Barras de onda de áudio */}
        <g fill="#12847B">
          <rect x="20" y="46" width="4" height="10" rx="2" />
          <rect x="28" y="42" width="4" height="16" rx="2" />
          <rect x="36" y="45" width="4" height="11" rx="2" />
          <rect x="44" y="40" width="4" height="18" rx="2" />
          <rect x="52" y="44" width="4" height="12" rx="2" />
          <rect x="60" y="47" width="4" height="8" rx="2" />
        </g>
      </g>

      {/* NÓ CENTRAL: Núcleo DC Foundry Digital (Agente IA + RAG pgvector + RBAC) */}
      <g transform={`translate(216, ${114 + pulseY})`}>
        <rect
          width="128"
          height="112"
          rx="20"
          fill="#0A1D35"
          stroke="url(#dcf-node-grad)"
          strokeWidth="2.5"
        />
        <circle cx="64" cy="44" r="24" fill="#0D2B4C" stroke="#1D5FAE" strokeWidth="2" />
        {/* Monograma vetorial DC estilizado no centro */}
        <path
          d="M52 35 H60 A9 9 0 0 1 69 44 A9 9 0 0 1 60 53 H52 Z"
          fill="none"
          stroke="#DCE9F8"
          strokeWidth="2.8"
          strokeLinejoin="round"
        />
        <path
          d="M77 37 A8.5 8.5 0 0 0 65 44 A8.5 8.5 0 0 0 77 51"
          fill="none"
          stroke="#14B8A6"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <rect x="24" y="78" width="80" height="7" rx="3.5" fill="#DCE9F8" />
        <rect x="36" y="91" width="56" height="5" rx="2.5" fill="#12847B" />
      </g>

      {/* NÓ DIREITO SUPERIOR: Pipeline Kanban & Contratos Assinados */}
      <g transform={`translate(380, ${74 - pulseSecondary})`}>
        <rect width="124" height="68" rx="14" fill="url(#dcf-card-grad)" stroke="#1D5FAE" strokeWidth="1.5" />
        <rect x="16" y="16" width="26" height="36" rx="5" fill="#0D2B4C" stroke="#123B63" />
        <rect x="49" y="16" width="26" height="36" rx="5" fill="#0D2B4C" stroke="#1D5FAE" />
        <rect x="82" y="16" width="26" height="36" rx="5" fill="#0F766E" />
        <path d="M90 34 L94 38 L101 30" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
      </g>

      {/* NÓ DIREITO INFERIOR: Receita MRR & Google Ads Offline Upload */}
      <g transform={`translate(380, ${196 + pulseSecondary})`}>
        <rect width="124" height="68" rx="14" fill="url(#dcf-card-grad)" stroke="#0F766E" strokeWidth="1.5" />
        <polyline
          points="20,50 42,38 64,43 86,24 106,16"
          fill="none"
          stroke="#14B8A6"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="106" cy="16" r="4.5" fill="#DEF3EF" />
        <rect x="20" y="16" width="42" height="6" rx="3" fill="#DCE9F8" />
      </g>
    </svg>
  );
};

// Mantém alias BedArt apontando para FoundryArchitectureArt caso algum teste legado importe
export const BedArt = FoundryArchitectureArt;

/**
 * 2. Ilustração vetorial de Deploy / Entrega de Projeto & Squad
 */
export const DeliveryArt: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg
    viewBox="0 0 200 110"
    style={{ width: 148, height: 82, ...style }}
    role="img"
    aria-label="Ilustração vetorial de arquitetura e entrega de projetos"
  >
    <rect x="16" y="18" width="74" height="72" rx="12" fill="#EEF4FC" stroke="#DCE9F8" strokeWidth="2" />
    <rect x="28" y="32" width="38" height="6" rx="3" fill="#1D5FAE" />
    <rect x="28" y="44" width="50" height="5" rx="2.5" fill="#667789" />
    <rect x="28" y="56" width="44" height="5" rx="2.5" fill="#667789" />
    <path d="M96 54 H122" stroke="#1D5FAE" strokeWidth="2.5" strokeDasharray="4 4" strokeLinecap="round" />
    <rect x="126" y="24" width="58" height="60" rx="14" fill="#0A1D35" stroke="#123B63" strokeWidth="2" />
    <circle cx="155" cy="54" r="14" fill="#0F766E" />
    <path d="M149 54 L153 58 L162 49" fill="none" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" />
  </svg>
);

/**
 * 3. Ilustração vetorial de Contrato Digital Assinado
 */
export const ContractSignedArt: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg
    viewBox="0 0 180 120"
    style={{ width: 132, height: 88, ...style }}
    role="img"
    aria-label="Ilustração de contrato assinado eletronicamente"
  >
    <rect x="34" y="10" width="96" height="100" rx="12" fill="#FFFDF9" stroke="#D6DFE7" strokeWidth="2.5" />
    <line x1="50" y1="32" x2="110" y2="32" stroke="#DCE9F8" strokeWidth="6" strokeLinecap="round" />
    <line x1="50" y1="48" x2="102" y2="48" stroke="#DCE9F8" strokeWidth="6" strokeLinecap="round" />
    <line x1="50" y1="64" x2="90" y2="64" stroke="#DCE9F8" strokeWidth="6" strokeLinecap="round" />
    <path
      d="M50 86 Q 65 72, 76 86 T 106 82"
      fill="none"
      stroke="#1D5FAE"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <circle cx="128" cy="84" r="19" fill="#0F766E" />
    <path
      d="M120 84 L126 90 L137 78"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * 4. Traço editorial desenhado à mão sob títulos (<Mark>...</Mark>)
 */
export const Mark: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="dcf-mark">
    {children}
    <svg viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true">
      <path d="M3 10 Q 98 3 197 9" />
    </svg>
  </span>
);
