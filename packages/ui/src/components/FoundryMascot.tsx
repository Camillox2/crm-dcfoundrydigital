import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useReducedMotion } from 'framer-motion';

export type FoundryMood = 'happy' | 'thinking' | 'invite' | 'alert' | 'sleepy';

export function FoundryMascot({
  size = 42,
  mood = 'happy',
  wave = false,
  paused = false,
}: {
  size?: number;
  mood?: FoundryMood;
  wave?: boolean;
  paused?: boolean;
}) {
  const motionPreference = useReducedMotion();
  const reduced = motionPreference || paused;
  const expressiveMood = mood;
  const isSleepy = expressiveMood === 'sleepy';
  const shouldBlink = !reduced && (expressiveMood === 'happy' || expressiveMood === 'alert');
  const eyeScale = isSleepy ? 0.18 : shouldBlink ? [1, 1, 1, 0.2, 1, 1] : 1;
  const mouthPath = isSleepy
    ? 'M 20 30 C 24 33 28 33 32 30'
    : expressiveMood === 'thinking'
      ? 'M 17 30 C 22 28 30 28 35 30'
      : expressiveMood === 'alert'
        ? 'M 22 30 C 22 25 30 25 30 30 C 30 34 22 34 22 30'
        : expressiveMood === 'invite'
          ? 'M 11 25 C 20 41 36 41 45 25'
          : 'M 13 26 C 21 40 35 40 43 26';

  // Olhos seguem o cursor (só em dispositivos com mouse; barato: 1 listener + rAF)
  const rootRef = useRef<HTMLDivElement>(null);
  const pupilX = useMotionValue(0);
  const pupilY = useMotionValue(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isSleepy) {
      pupilX.set(0);
      pupilY.set(0);
      return;
    }
    if (reduced || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let raf = 0;
    const onMove = (e: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = rootRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const dist = Math.hypot(dx, dy) || 1;
        const max = size * 0.04;
        const pull = Math.min(max, dist * 0.06);
        pupilX.set((dx / dist) * pull);
        pupilY.set((dy / dist) * pull);
      });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isSleepy, size, pupilX, pupilY, reduced]);

  return (
    <motion.div
      ref={rootRef}
      className="foundry-mascot"
      style={{ width: size, height: size }}
      animate={
        reduced
          ? {}
          : {
              y: isSleepy
                ? [0, -1, 0]
                : expressiveMood === 'invite'
                  ? [0, -4, 0]
                  : expressiveMood === 'thinking'
                    ? [0, -1.5, 0]
                    : [0, -2.5, 0],
              rotate: expressiveMood === 'thinking' ? [0, 1.5, -1.5, 0] : isSleepy ? [0, 2, 0] : 0,
            }
      }
      transition={{
        duration: isSleepy ? 4.5 : expressiveMood === 'invite' ? 1.8 : 2.8,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
      aria-hidden="true"
    >
      {wave && (
        <motion.span
          data-foundry-wave
          className="foundry-hand"
          style={{
            left: '73%',
            top: '8%',
            width: '25%',
            height: '54%',
            borderRadius: '48% 52% 42% 42% / 30% 30% 70% 70%',
            background:
              'radial-gradient(ellipse 80% 60% at 40% 20%,#dbeafe,#60a5fa 45%,#2563eb 85%,#1e40af)',
            boxShadow:
              'inset -3px -4px 6px rgba(0,0,0,.28),inset 2px 2px 4px rgba(255,255,255,.2),0 4px 12px rgba(59,130,246,.4)',
            transformOrigin: '50% 92%',
          }}
          initial={{ rotate: 6, scaleX: 0.6, scaleY: 0.05, opacity: 0 }}
          animate={
            reduced
              ? { rotate: 20, scaleX: 1, scaleY: 1, opacity: 1 }
              : {
                  rotate: [6, 20, 44, 14, 42, 14, 36, 18, 6],
                  scaleX: [0.6, 1.04, 0.92, 1.05, 0.92, 1.05, 0.95, 1, 0.6],
                  scaleY: [0.05, 1.02, 1.08, 0.95, 1.08, 0.95, 1.04, 1, 0.05],
                  opacity: [0, 1, 1, 1, 1, 1, 1, 1, 0],
                }
          }
          transition={
            reduced
              ? { duration: 0 }
              : {
                  duration: 2.6,
                  repeat: Infinity,
                  repeatDelay: 7.4,
                  ease: 'easeInOut',
                  times: [0, 0.1, 0.24, 0.38, 0.52, 0.66, 0.8, 0.91, 1],
                }
          }
        >
          <span
            className="foundry-detail"
            style={{
              left: '24%',
              top: '12%',
              width: '22%',
              height: '34%',
              borderRadius: '50%',
              background: 'rgba(255,255,255,.55)',
              filter: 'blur(1px)',
            }}
          />
        </motion.span>
      )}
      <motion.div
        className="foundry-body"
        animate={
          reduced
            ? {}
            : {
                borderRadius: [
                  '58% 42% 38% 62% / 56% 38% 62% 44%',
                  '46% 54% 59% 41% / 45% 58% 42% 55%',
                  '58% 42% 38% 62% / 56% 38% 62% 44%',
                ],
                boxShadow: [
                  '0 8px 24px rgba(59,130,246,.45), inset -7px -9px 16px rgba(0,0,0,.34), inset 6px 7px 12px rgba(255,255,255,.18)',
                  '0 10px 30px rgba(96,165,250,.58), inset -7px -9px 16px rgba(0,0,0,.34), inset 6px 7px 12px rgba(255,255,255,.2)',
                  '0 8px 24px rgba(59,130,246,.45), inset -7px -9px 16px rgba(0,0,0,.34), inset 6px 7px 12px rgba(255,255,255,.18)',
                ],
              }
        }
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          borderRadius: '58% 42% 38% 62% / 56% 38% 62% 44%',
          boxShadow:
            '0 8px 24px rgba(59,130,246,.45), inset -7px -9px 16px rgba(0,0,0,.34), inset 6px 7px 12px rgba(255,255,255,.18)',
          background:
            'radial-gradient(circle at 30% 24%, #eff6ff, #60a5fa 34%, #2563eb 72%, #1e3a8a 100%)',
        }}
      >
        <div
          className="foundry-shine"
          style={{
            top: '9%',
            left: '18%',
            width: '38%',
            height: '24%',
            background:
              'radial-gradient(ellipse at center, rgba(255,255,255,.55), transparent 70%)',
            filter: 'blur(2px)',
          }}
        />
        <div className="foundry-brows" style={{ width: size * 0.54 }}>
          {[0, 1].map((i) => (
            <motion.span
              key={i}
              className="foundry-brow"
              style={{
                width: size * 0.18,
                height: Math.max(2.5, size * 0.05),
                transformOrigin: i === 0 ? 'right center' : 'left center',
              }}
              animate={{
                rotate: isSleepy
                  ? i === 0
                    ? -6
                    : 6
                  : expressiveMood === 'thinking'
                    ? i === 0
                      ? -12
                      : 12
                    : expressiveMood === 'invite'
                      ? i === 0
                        ? 11
                        : -11
                      : i === 0
                        ? 4
                        : -4,
                y: isSleepy ? 2 : expressiveMood === 'invite' ? -2 : 0,
              }}
              transition={{ duration: 0.25 }}
            />
          ))}
        </div>
        <div className="foundry-eyes" style={{ width: size * 0.52 }}>
          {[0, 1].map((i) => (
            <motion.div
              key={i}
              className="foundry-eye"
              style={{
                width: size * 0.22,
                height: size * 0.22,
                boxShadow: 'inset 0 1px 4px rgba(0,0,0,.2)',
              }}
              animate={{ scaleY: eyeScale }}
              transition={
                shouldBlink && !isSleepy
                  ? {
                      duration: 8,
                      repeat: Infinity,
                      delay: i * 0.08,
                      times: [0, 0.86, 0.89, 0.92, 0.95, 1],
                    }
                  : { duration: 0.35 }
              }
            >
              {/* camada externa: olhos seguem o cursor */}
              <motion.div style={{ x: pupilX, y: pupilY }}>
                <motion.div
                  className="foundry-pupil"
                  style={{
                    width: size * 0.125,
                    height: size * 0.125,
                    background: 'radial-gradient(circle at 32% 32%, #1e3a8a, #050816 70%)',
                  }}
                  animate={
                    reduced
                      ? {}
                      : {
                          x:
                            expressiveMood === 'thinking'
                              ? [0, -1.5, 1.5, 0]
                              : expressiveMood === 'invite'
                                ? [0, 1, 0]
                                : 0,
                          y: expressiveMood === 'invite' ? [-0.5, 0.5, -0.5] : 0,
                        }
                  }
                  transition={{ duration: 1.8, repeat: Infinity }}
                >
                  <span
                    className="foundry-glint"
                    style={{ width: size * 0.045, height: size * 0.045 }}
                  />
                </motion.div>
              </motion.div>
            </motion.div>
          ))}
        </div>
        <svg
          className="foundry-mouth"
          width={size * 0.54}
          height={size * 0.24}
          viewBox="0 0 52 42"
          fill="none"
        >
          <motion.path
            d={mouthPath}
            stroke="#050816"
            strokeWidth={isSleepy ? 2.6 : expressiveMood === 'thinking' ? 3 : 3.8}
            strokeLinecap="round"
            fill="none"
            animate={{
              pathLength: !reduced && expressiveMood === 'thinking' ? [0.8, 1, 0.8] : 1,
            }}
            transition={{ duration: 1.8, repeat: Infinity }}
          />
        </svg>
      </motion.div>
    </motion.div>
  );
}
