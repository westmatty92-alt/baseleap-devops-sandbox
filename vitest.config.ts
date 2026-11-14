import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // `server-only` throws outside Next's server bundle; API tests import server code directly.
      'server-only': path.resolve(import.meta.dirname, 'tests/helpers/server-only.ts'),
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom', // API tests switch to node with `// @vitest-environment node`
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}', 'tests/api/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'tests/fuzz/**', 'node_modules/**'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
