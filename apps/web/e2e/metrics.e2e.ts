/**
 * E2E — Métricas (/metrics)
 */
import { test, expect } from '@playwright/test';
import {
  skipIfNoCredentials,
  gotoProtected,
  assertNoTechnicalErrors,
  waitForTableOrEmpty,
} from './helpers';

test.describe('Métricas', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(skipIfNoCredentials(), 'E2E_TEST_EMAIL/PASSWORD no configuradas');
    await gotoProtected(page, '/metrics');
  });

  test('carga la página con h1 Métricas', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: /métricas/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('muestra tabla o estado vacío', async ({ page }) => {
    await waitForTableOrEmpty(page, {
      tableLabel: 'Tabla de métricas',
      emptyHeading: 'Sin métricas',
    });
  });

  test('filtro por plataforma actualiza la URL', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const platformSelect = page
      .getByRole('combobox')
      .filter({ hasText: /todas las plataformas|plataforma/i });
    if (await platformSelect.isVisible()) {
      await platformSelect.selectOption({ index: 1 });
      await expect(page).toHaveURL(/platform=/, { timeout: 5_000 });
    }
  });

  test('filtro por período actualiza la URL', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const periodSelect = page
      .getByRole('combobox')
      .filter({ hasText: /todos los períodos|período/i });
    if (await periodSelect.isVisible()) {
      const options = await periodSelect.locator('option').all();
      if (options.length > 1) {
        await periodSelect.selectOption({ index: 1 });
        await expect(page).toHaveURL(/period=/, { timeout: 5_000 });
      }
    }
  });

  test('la paginación aparece si hay más de una página', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    // Si hay paginación, debe tener botones accesibles
    const prevBtn = page.getByRole('button', { name: /anterior/i });
    const nextBtn = page.getByRole('button', { name: /siguiente/i });
    // Al menos uno debe estar visible o no existir (si hay una sola página)
    const hasPagination = (await prevBtn.isVisible()) || (await nextBtn.isVisible());
    if (hasPagination) {
      // Botón anterior deshabilitado en página 1
      await expect(prevBtn).toBeDisabled();
    }
  });

  test('valores numéricos muestran formato correcto', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const table = page.getByRole('table', { name: 'Tabla de métricas' });
    if (await table.isVisible()) {
      const body = await page.textContent('body');
      // Valores formateados: $X.XM o $X.XK (no decimales sin formatear)
      expect(body).not.toMatch(/\$\d{7,}/); // no muestra números sin formatear > 1M
    }
  });

  test('no expone errores técnicos', async ({ page }) => {
    await assertNoTechnicalErrors(page);
  });

  test('organizationId no aparece en la URL', async ({ page }) => {
    expect(page.url()).not.toMatch(/organizationId=/);
  });
});
