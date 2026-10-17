import React, { useEffect, useState } from 'react';
import { useTheme } from '../ThemeProvider.js';

export interface AnimatedCounterProps {
  value: number;
  durationMs?: number;
  formatter?: (val: number) => string;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  durationMs = 700,
  formatter = (v) => Math.round(v).toLocaleString('pt-BR'),
}) => {
  const { prefersReducedMotion } = useTheme();
  const [displayValue, setDisplayValue] = useState<number>(prefersReducedMotion ? value : 0);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayValue(value);
      return;
    }

    let animationFrame = 0;
    const startTime = performance.now();
    const initialValue = displayValue;
    const delta = value - initialValue;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(initialValue + delta * eased);
      if (progress < 1) {
        animationFrame = requestAnimationFrame(tick);
      }
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, durationMs, prefersReducedMotion]);

  return (
    <span
      style={{
        fontFamily: 'var(--font-display)',
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 800,
      }}
    >
      {formatter(displayValue)}
    </span>
  );
};
