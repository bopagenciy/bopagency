/**
 * E2E — Responsive visual (mobile, tablet, desktop)
 *
 * Ejecutado por los proyectos "mobile" y "tablet" de playwright.config.ts
 * y también por "chromium" en desktop (1280×720 por defecto).
 */
import { test, expect } from '@playwright/test';
import { skipIfNoCredentials, gotoProtected } from './helpers';

const ROUTES = ['/dashboard', '/alerts', '/tasks', '/metrics'];

for (const route of ROUTES) {
  test.describe(`Responsive: ${route}`, () => {
    test.beforeEach(async ({ page }) => {
      test.skip(skipIfNoCredentials(), 'E2E_TEST_EMAIL/PASSWORD no configuradas');
      await gotoProtected(page, route);
      await page.waitForLoadState('networkidle');
    });

    test('sin scroll horizontal global', async ({ page }) => {
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      // Tolerancia de 2px por bordes/scrollbars
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
    });

    test('heading principal visible', async ({ page }) => {
      // Todas las rutas protegidas tienen al menos un heading
      const h1 = page.getByRole('heading', { level: 1 });
      await expect(h1).toBeVisible({ timeout: 8_000 });
    });

    test('contenido principal visible sin overlap (landmark main único)', async ({ page }) => {
      const main = page.getByRole('main');
      // Debe haber exactamente un <main> (del AppShell)
      await expect(main).toHaveCount(1);
      await expect(main).toBeVisible();
      const box = await main.boundingBox();
      expect(box?.width).toBeGreaterThan(100);
      expect(box?.height).toBeGreaterThan(50);
    });
  });
}
