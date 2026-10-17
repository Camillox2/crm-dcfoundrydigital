import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@dcfoundry/ui';
import { App } from './App.js';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <ThemeProvider defaultTheme="light">
        <App />
      </ThemeProvider>
    </React.StrictMode>,
  );
}
