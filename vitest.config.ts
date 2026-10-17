import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    alias: {
      '@dcfoundry/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
      '@dcfoundry/db': path.resolve(__dirname, 'packages/db/src/index.ts'),
      '@dcfoundry/ui': path.resolve(__dirname, 'packages/ui/src/index.ts'),
    },
  },
});
