import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      // server-only is a Next.js runtime guard — stub it in tests
      'server-only': path.resolve(__dirname, './src/test/server-only-mock.ts'),
      '@': path.resolve(__dirname, './src'),
      '@bop-agency/ui': path.resolve(
        __dirname,
        '../../packages/ui/src/index.ts',
      ),
      '@bop-agency/shared': path.resolve(
        __dirname,
        '../../packages/shared/src/index.ts',
      ),
      '@bop-agency/domain': path.resolve(
        __dirname,
        '../../packages/domain/src/index.ts',
      ),
      '@bop-agency/application': path.resolve(
        __dirname,
        '../../packages/application/src/index.ts',
      ),
      '@bop-agency/infrastructure': path.resolve(
        __dirname,
        '../../packages/infrastructure/src/index.ts',
      ),
      '@bop-agency/ai-engine': path.resolve(
        __dirname,
        '../../packages/ai-engine/src/index.ts',
      ),
    },
  },
});
