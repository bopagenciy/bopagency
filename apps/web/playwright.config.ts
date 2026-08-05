import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration — BopIAgency E2E
 *
 * Requiere variables de entorno en apps/web/.env.test.local:
 *   E2E_TEST_EMAIL=test@example.com
 *   E2E_TEST_PASSWORD=your-test-password
 *   E2E_BASE_URL=http://localhost:3200  (opcional)
 *
 * Los tests se omiten automáticamente si E2E_TEST_EMAIL no está definida.
 *
 * Para ejecutar:
 *   cd apps/web
 *   npx playwright install chromium
 *   E2E_TEST_EMAIL=... E2E_TEST_PASSWORD=... npx playwright test
 */

const BASE_URL = process.env['E2E_BASE_URL'] ?? 'http://localhost:3200';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false, // auth state is shared
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'es-CO',
  },

  projects: [
    // Auth setup — runs first, saves storageState
    {
      name: 'setup',
      testMatch: '**/auth.setup.ts',
      use: { ...devices['Desktop Chrome'] },
    },

    // Main tests — use saved auth state
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // Mobile viewport
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 14'],
        storageState: './e2e/.auth/user.json',
        viewport: { width: 390, height: 844 },
      },
      dependencies: ['setup'],
    },

    // Tablet viewport
    {
      name: 'tablet',
      use: {
        ...devices['iPad Mini'],
        storageState: './e2e/.auth/user.json',
        viewport: { width: 768, height: 1024 },
      },
      dependencies: ['setup'],
    },
  ],

  // Start Next.js dev server if not already running
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
