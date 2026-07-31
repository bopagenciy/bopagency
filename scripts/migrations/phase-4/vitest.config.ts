// vitest.config.ts â€” usa la instalaciÃ³n de vitest del workspace de application
// Ejecutar desde el root del workspace: packages/application/node_modules/.bin/vitest run
export default {
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    globals: false,
  },
};
