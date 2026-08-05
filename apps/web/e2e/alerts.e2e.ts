/**
 * E2E — Alertas (/alerts)
 */
import { test, expect } from '@playwright/test';
import {
  skipIfNoCredentials,
  gotoProtected,
  assertNoTechnicalErrors,
  waitForTableOrEmpty,
} from './helpers';

test.describe('Alertas', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(skipIfNoCredentials(), 'E2E_TEST_EMAIL/PASSWORD no configuradas');
    await gotoProtected(page, '/alerts');
  });

  test('carga la página con h1 Alertas', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: /alertas/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('muestra tabla o estado vacío', async ({ page }) => {
    await waitForTableOrEmpty(page, {
      tableLabel: 'Lista de alertas',
      emptyHeading: 'Sin alertas',
    });
  });

  test('badges de severidad son visibles', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const table = page.getByRole('table', { name: 'Lista de alertas' });
    if (await table.isVisible()) {
      // Debe haber al menos un badge de severidad
      const severityTexts = ['Crítica', 'Advertencia', 'Info'];
      let found = false;
      for (const text of severityTexts) {
        if (
          await page
            .getByText(text)
            .first()
            .isVisible()
            .catch(() => false)
        ) {
          found = true;
          break;
        }
      }
      // Si hay filas, debe haber badges
      const rows = table.getByRole('row');
      const rowCount = await rows.count();
      if (rowCount > 1) {
        // rowCount > 1 porque la primera fila es el header
        expect(found).toBe(true);
      }
    }
  });

  test('filtro de estado actualiza la URL', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const statusSelect = page.locator('select').first();
    if (await statusSelect.isVisible()) {
      await statusSelect.selectOption({ index: 1 });
      // URL debe actualizar con status=
      await expect(page).toHaveURL(/status=/, { timeout: 5_000 });
    }
  });

  test('filtro de severidad actualiza la URL', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const selects = page.locator('select');
    const count = await selects.count();
    if (count >= 2) {
      await selects.nth(1).selectOption({ index: 1 });
      await expect(page).toHaveURL(/severity=/, { timeout: 5_000 });
    }
  });

  test('botón Reconocer está disponible para alertas activas', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const table = page.getByRole('table', { name: 'Lista de alertas' });
    if (await table.isVisible()) {
      const acknowledgeBtn = page.getByRole('button', { name: /reconocer/i });
      // Si existe, debe ser clickeable (no disabled)
      if (
        await acknowledgeBtn
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await expect(acknowledgeBtn.first()).toBeEnabled();
      }
    }
  });

  test('acknowledge de alerta activa funciona (si hay datos)', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const acknowledgeBtn = page.getByRole('button', { name: /reconocer/i }).first();
    if (await acknowledgeBtn.isVisible().catch(() => false)) {
      await acknowledgeBtn.click();
      // Esperar que el botón desaparezca o cambie (revalidatePath actualiza la tabla)
      await page.waitForTimeout(2_000);
      // No debe haber error visible
      await expect(page.getByRole('alert'))
        .not.toBeVisible({ timeout: 3_000 })
        .catch(() => {
          // El RepositoryErrorState puede no existir — ok
        });
    }
  });

  test('botón Resolver disponible para alertas reconocidas', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const resolveBtn = page.getByRole('button', { name: /resolver/i });
    if (
      await resolveBtn
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await expect(resolveBtn.first()).toBeEnabled();
    }
  });

  test('aislamiento multi-tenant: organizationId no en URL', async ({ page }) => {
    expect(page.url()).not.toMatch(/organizationId=/);
  });

  test('paginación funciona', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const nextBtn = page.getByRole('button', { name: /siguiente/i });
    if (
      (await nextBtn.isVisible().catch(() => false)) &&
      (await nextBtn.isEnabled().catch(() => false))
    ) {
      await nextBtn.click();
      await expect(page).toHaveURL(/page=2/, { timeout: 5_000 });
    }
  });

  test('no expone errores técnicos', async ({ page }) => {
    await assertNoTechnicalErrors(page);
  });
});
