import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    minify: 'esbuild',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'motion-vendor': ['framer-motion'],
          'icons-vendor': ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.CRM_API_URL ?? 'http://127.0.0.1:4001',
      '/socket.io': {
        target: process.env.CRM_API_URL ?? 'http://127.0.0.1:4001',
        ws: true,
      },
    },
  },
});
