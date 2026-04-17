import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['admin-motor/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    setupFiles: ['./admin-motor/src/test-setup.ts'],
  },
});
