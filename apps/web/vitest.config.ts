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
      '@': path.resolve(__dirname, './src'),
      '@bop-agency/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@bop-agency/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@bop-agency/domain': path.resolve(__dirname, '../../packages/domain/src/index.ts'),
      '@bop-agency/application': path.resolve(__dirname, '../../packages/application/src/index.ts'),
    },
  },
});
