import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@bop-agency/domain':            fileURLToPath(new URL('../domain/src/index.ts', import.meta.url)),
      '@bop-agency/shared':            fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
      '@bop-agency/automation-engine': fileURLToPath(new URL('../automation-engine/src/index.ts', import.meta.url)),
      '@bop-agency/ai-engine':          fileURLToPath(new URL('../ai-engine/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
