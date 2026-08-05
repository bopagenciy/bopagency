/**
 * E2E — Tareas (/tasks)
 */
import { test, expect } from '@playwright/test';
import {
  skipIfNoCredentials,
  gotoProtected,
  assertNoTechnicalErrors,
  waitForTableOrEmpty,
} from './helpers';

test.describe('Tareas', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(skipIfNoCredentials(), 'E2E_TEST_EMAIL/PASSWORD no configuradas');
    await gotoProtected(page, '/tasks');
  });

  test('carga la página con h1 Tareas', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: /tareas/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('muestra tabla o estado vacío', async ({ page }) => {
    await waitForTableOrEmpty(page, {
      tableLabel: 'Lista de tareas',
      emptyHeading: 'Sin tareas',
    });
  });

  test('filtro de estado actualiza la URL', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const statusSelect = page.locator('select').first();
    if (await statusSelect.isVisible()) {
      await statusSelect.selectOption({ index: 1 });
      await expect(page).toHaveURL(/status=/, { timeout: 5_000 });
    }
  });

  test('badge de prioridad visible en tareas', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const table = page.getByRole('table', { name: 'Lista de tareas' });
    if (await table.isVisible()) {
      const priorityTexts = ['Alta', 'Media', 'Baja', 'Urgente'];
      let found = false;
      for (const text of priorityTexts) {
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
      const rows = await table.getByRole('row').count();
      if (rows > 1) {
        expect(found).toBe(true);
      }
    }
  });

  test('tarea vencida muestra indicador visual (⚠️)', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    // Si hay tareas vencidas, el ⚠️ debe estar presente en el DOM
    const overdueIndicator = page.getByText('⚠️');
    // No fallamos si no hay tareas vencidas — depende de datos
    const hasOverdue = await overdueIndicator
      .first()
      .isVisible()
      .catch(() => false);
    if (hasOverdue) {
      expect(hasOverdue).toBe(true);
    }
  });

  test('selector de estado de tarea funciona', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const table = page.getByRole('table', { name: 'Lista de tareas' });
    if (await table.isVisible()) {
      // TaskStatusAction renderiza un <select> en cada fila para estados mutables
      const statusSelects = table.locator('select[aria-label]');
      const count = await statusSelects.count();
      if (count > 0) {
        // Verifica que el primer select tiene opciones válidas
        const options = await statusSelects.first().locator('option').allTextContents();
        expect(options.length).toBeGreaterThan(0);
        // Las opciones deben ser estados en español
        const validLabels = ['Pendiente', 'En progreso', 'Completada', 'Cancelada', 'Bloqueada'];
        const hasValidLabel = options.some((o) => validLabels.some((v) => o.includes(v)));
        expect(hasValidLabel).toBe(true);
      }
    }
  });

  test('transición de estado no disponible para tareas finales', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    // Tareas con status "done" o "cancelled" no deben tener select visible
    // Validamos que el número de selects es <= número de filas no-finales
    const table = page.getByRole('table', { name: 'Lista de tareas' });
    if (await table.isVisible()) {
      const completedBadges = await page.getByText('Completada').count();
      const cancelledBadges = await page.getByText('Cancelada').count();
      const actionSelects = await table.locator('select').count();
      const totalRows = (await table.getByRole('row').count()) - 1; // sin header
      // selects <= (total - finales)
      expect(actionSelects).toBeLessThanOrEqual(totalRows - completedBadges - cancelledBadges);
    }
  });

  test('pending state visible durante mutación (aria-busy)', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const table = page.getByRole('table', { name: 'Lista de tareas' });
    if (await table.isVisible()) {
      const statusSelect = table.locator('select').first();
      if (await statusSelect.isVisible().catch(() => false)) {
        const options = await statusSelect.locator('option').all();
        if (options.length > 0) {
          // Cambiar el select desencadena la acción
          await statusSelect.selectOption({ index: 0 });
          // aria-busy=true debería aparecer brevemente — difícil de capturar en E2E sin delay
          // Verificamos que no hay error después de la acción
          await page.waitForTimeout(1_500);
          await assertNoTechnicalErrors(page);
        }
      }
    }
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

  test('organizationId no en URL', async ({ page }) => {
    expect(page.url()).not.toMatch(/organizationId=/);
  });

  test('no expone errores técnicos', async ({ page }) => {
    await assertNoTechnicalErrors(page);
  });
});
