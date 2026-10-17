import { useId } from 'react';
import { MessageSquare, FileText, Megaphone, Check, Code2, Pause, Play } from 'lucide-react';
import { FoundryMascot, useTheme } from '@dcfoundry/ui';

/** The original website character, surrounded by code-native vector artwork. */
export function WorkspaceArt({ paused = false }: { paused?: boolean }) {
  const { prefersReducedMotion } = useTheme();
  return (
    <div className="workspace-art" aria-hidden="true" data-reduced={prefersReducedMotion}>
      <svg className="workspace-orbit" viewBox="0 0 480 255" fill="none">
        <ellipse cx="242" cy="135" rx="195" ry="82" transform="rotate(-14 242 135)" />
        <ellipse
          className="orbit-trace"
          cx="242"
          cy="135"
          rx="183"
          ry="74"
          transform="rotate(-14 242 135)"
        />
        <circle cx="112" cy="70" r="4" />
        <circle cx="397" cy="155" r="4" />
      </svg>
      <div className="art-doc">
        <FileText />
        <span />
        <span />
        <span />
      </div>
      <div className="art-chat">
        <MessageSquare />
        <i />
        <i />
        <i />
      </div>
      <svg className="art-browser" viewBox="0 0 165 112" fill="none">
        <rect x="1" y="1" width="163" height="110" rx="9" fill="var(--bg-card)" />
        <path d="M1 24h163" />
        <circle cx="13" cy="13" r="2" />
        <circle cx="23" cy="13" r="2" />
        <circle cx="33" cy="13" r="2" />
        <path d="M17 43h34m-34 12h24m-24 12h29m20 22 21-22 20 10 29-31 14 14" />
        <rect x="65" y="37" width="83" height="57" rx="3" />
      </svg>
      <div className="art-code">
        <Code2 />
        <span />
        <span />
        <span />
      </div>
      <div className="art-foundry">
        <FoundryMascot size={114} paused={prefersReducedMotion || paused} />
      </div>
    </div>
  );
}

const flowSteps = [
  {
    title: 'Clique & campanha',
    text: 'A origem de cada oportunidade.',
    icon: Megaphone,
  },
  { title: 'Conversa', text: 'Atendimento que aproxima.', icon: MessageSquare },
  { title: 'Proposta', text: 'Uma solução para cada desafio.', icon: FileText },
  { title: 'Contrato', text: 'Uma nova parceria começa.', icon: Check },
];

export function ConnectedFlow({ paused, onToggle }: { paused: boolean; onToggle: () => void }) {
  const { prefersReducedMotion } = useTheme();
  return (
    <section
      className="connected-flow"
      data-paused={paused || prefersReducedMotion}
      aria-label="Etapas do fluxo comercial"
    >
      <div className="panel-heading">
        <div>
          <h3>Seu fluxo, conectado.</h3>
          <p>Da campanha ao contrato, tudo no mesmo lugar.</p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onToggle}
          aria-label={paused ? 'Reproduzir animações' : 'Pausar animações'}
          aria-pressed={paused}
        >
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
      </div>
      <div className="flow-steps">
        <svg
          className="flow-line"
          viewBox="0 0 1000 60"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden="true"
        >
          <path d="M0 26C130 0 220 58 340 27S570 2 670 28 880 57 1000 25" />
          <path className="flow-packet" d="M0 26C130 0 220 58 340 27S570 2 670 28 880 57 1000 25" />
        </svg>
        {flowSteps.map(({ title, text, icon: Icon }, i) => (
          <div className="flow-step" key={title}>
            <span className="flow-icon" style={{ animationDelay: `${i * 1.4}s` }}>
              <Icon size={20} />
            </span>
            <strong>{title}</strong>
            <p>{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Sparkline({ index = 0 }: { index?: number }) {
  const gradient = useId().replaceAll(':', '');
  const paths = [
    'M2 38C14 39 14 27 24 28S36 35 45 17 58 26 65 13 76 17 89 3',
    'M2 39C13 39 18 26 25 27S37 39 47 24 55 34 66 17 77 25 89 4',
    'M2 38C18 39 17 30 28 26S38 34 49 19 65 26 74 12 81 18 89 6',
  ];
  const path = paths[index % paths.length];
  return (
    <svg className="kpi-spark" viewBox="0 0 92 46" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#1D5FAE" stopOpacity=".14" />
          <stop offset="1" stopColor="#1D5FAE" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path}V46H2Z`} fill={`url(#${gradient})`} />
      <path
        className="spark-line"
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
