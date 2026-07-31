// vitest.config.ts — usa la instalación de vitest del workspace de application
// Ejecutar desde el root del workspace: packages/application/node_modules/.bin/vitest run
export default {
  test: {
    environment: 'node',
    include: ['scripts/migrations/phase-4/__tests__/**/*.test.ts'],
    globals: false,
  },
};
