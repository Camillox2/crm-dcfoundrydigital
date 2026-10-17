import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    maxWorkers:2,
    include: ['tests/**/*.test.ts'],
    alias: {
      '@dcfoundry/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
      '@dcfoundry/db': path.resolve(__dirname, 'packages/db/src/index.ts'),
      '@dcfoundry/ui': path.resolve(__dirname, 'packages/ui/src/index.ts'),
      '@dcfoundry/ai': path.resolve(__dirname, 'packages/ai/src/index.ts'),
      '@dcfoundry/tracking': path.resolve(__dirname, 'packages/tracking/src/index.ts'),
    },
  },
});
