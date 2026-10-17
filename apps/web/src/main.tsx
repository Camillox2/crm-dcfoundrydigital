import React from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { ThemeProvider } from '@dcfoundry/ui';
import { App } from './App.js';
import { AppRecovery } from './components/AppRecovery.js';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <MotionConfig reducedMotion="user">
        <ThemeProvider defaultTheme="light">
          <AppRecovery>
            <App />
          </AppRecovery>
        </ThemeProvider>
      </MotionConfig>
    </React.StrictMode>,
  );
}
