import React, { createContext, useContext, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeMode;
  toggleTheme: (origin?: { x: number; y: number }) => void;
  setTheme: (mode: ThemeMode) => void;
  prefersReducedMotion: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => undefined,
  setTheme: () => undefined,
  prefersReducedMotion: false,
});

type DocumentWithViewTransition = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

export const ThemeProvider: React.FC<{
  children: React.ReactNode;
  defaultTheme?: ThemeMode;
}> = ({ children, defaultTheme = 'light' }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return defaultTheme;
    const saved = window.localStorage.getItem('dcfoundry-crm-theme');
    return saved === 'dark' || saved === 'light' ? saved : defaultTheme;
  });

  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(false);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      window.localStorage.setItem('dcfoundry-crm-theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const listener = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  const toggleTheme = () => {
    const next: ThemeMode = theme === 'light' ? 'dark' : 'light';
    if (typeof document === 'undefined') {
      setThemeState(next);
      return;
    }

    const doc = document as DocumentWithViewTransition;
    const commit = () => {
      document.documentElement.setAttribute('data-theme', next);
      flushSync(() => setThemeState(next));
    };

    if (!doc.startViewTransition || prefersReducedMotion) {
      commit();
      return;
    }

    doc.startViewTransition(commit);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        setTheme: setThemeState,
        prefersReducedMotion,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
