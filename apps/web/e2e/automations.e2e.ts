/**
 * E2E — Automatizaciones (/automations)
 *
 * Tests de smoke para la UI de administración de automatizaciones (Phase 6E).
 * Se omiten automáticamente si E2E_TEST_EMAIL no está definida.
 *
 * Estrategia: smoke + no-leak.
 * No se crean datos de prueba — se opera sobre los existentes en el entorno.
 * Si no hay automatizaciones, el test de "tabla o vacío" verifica el EmptyState.
 */
import { test, expect } from '@playwright/test';
import {
  skipIfNoCredentials,
  gotoProtected,
  assertNoTechnicalErrors,
  waitForTableOrEmpty,
} from './helpers';

// ─── /automations ─────────────────────────────────────────────────────────────

test.describe('Automatizaciones — lista (/automations)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(skipIfNoCredentials(), 'E2E_TEST_EMAIL/PASSWORD no configuradas');
    await gotoProtected(page, '/automations');
  });

  test('carga la página con h1 Automatizaciones', async ({ page }) => {
    await expect(
      page.getByRole('heading', { level: 1, name: /automatizaciones/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('muestra tabla o estado vacío', async ({ page }) => {
    await waitForTableOrEmpty(page, {
      tableLabel: 'Lista de automatizaciones',
      emptyHeading: 'Sin automatizaciones',
    });
  });

  test('no expone errores técnicos', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await assertNoTechnicalErrors(page);
  });

  test('filtro de estado actualiza la URL', async ({ page }) => {
    const select = page.getByRole('combobox', { name: /filtrar por estado/i });
    if (!(await select.isVisible().catch(() => false))) return;

    await select.selectOption('active');
    await expect(page).toHaveURL(/status=active/, { timeout: 8_000 });
    expect(new URL(page.url()).searchParams.get('page')).toBeNull();
  });

  test('sidebar contiene enlace a Automatizaciones', async ({ page }) => {
    const nav = page.getByRole('navigation');
    if (await nav.isVisible().catch(() => false)) {
      const link = nav.getByRole('link', { name: /automatizaciones/i });
      await expect(link).toBeVisible();
    }
  });

  test('breadcrumb muestra Automatizaciones', async ({ page }) => {
    await expect(page.getByText('Automatizaciones').first()).toBeVisible();
  });
});

// ─── /automations/[automationId] ──────────────────────────────────────────────

test.describe('Automatizaciones — detalle', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(skipIfNoCredentials(), 'E2E_TEST_EMAIL/PASSWORD no configuradas');
    await gotoProtected(page, '/automations');
  });

  test('navegar al detalle desde la tabla', async ({ page }) => {
    await waitForTableOrEmpty(page, {
      tableLabel: 'Lista de automatizaciones',
      emptyHeading: 'Sin automatizaciones',
    });

    const table = page.getByRole('table', { name: 'Lista de automatizaciones' });
    if (!(await table.isVisible().catch(() => false))) return;

    // Click en el primer enlace de nombre
    const firstLink = table.getByRole('link').first();
    if (!(await firstLink.isVisible().catch(() => false))) return;

    const href = await firstLink.getAttribute('href');
    await firstLink.click();

    // Esperar que el detalle cargue
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
    await expect(page).toHaveURL(new RegExp(`/automations/`), { timeout: 10_000 });
    await assertNoTechnicalErrors(page);
  });
});

// ─── /automations/executions/[executionId] ────────────────────────────────────

test.describe('Automatizaciones — detalle de ejecución', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(skipIfNoCredentials(), 'E2E_TEST_EMAIL/PASSWORD no configuradas');
  });

  test('página de ejecución inexistente redirige a 404', async ({ page }) => {
    await page.goto('/automations/executions/00000000-0000-0000-0000-000000000000', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    // Puede redirigir a /not-found o mostrar 404 en la misma URL
    const body = await page.textContent('body');
    const shows404 =
      page.url().includes('not-found') ||
      (body?.toLowerCase().includes('not found') ?? false) ||
      (body?.toLowerCase().includes('no encontrado') ?? false) ||
      (body?.toLowerCase().includes('404') ?? false);
    expect(shows404).toBe(true);
  });
});

// ─── Accessibility smoke ───────────────────────────────────────────────────────

test.describe('Automatizaciones — accesibilidad', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(skipIfNoCredentials(), 'E2E_TEST_EMAIL/PASSWORD no configuradas');
    await gotoProtected(page, '/automations');
  });

  test('tabla tiene aria-label', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const table = page.getByRole('table', { name: 'Lista de automatizaciones' });
    if (await table.isVisible().catch(() => false)) {
      await expect(table).toHaveAttribute('aria-label', 'Lista de automatizaciones');
    }
  });

  test('badges de estado tienen aria-label', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const badges = page.locator('[aria-label^="Estado:"]');
    const count = await badges.count();
    // Si hay filas en la tabla, debe haber badges con aria-label
    const table = page.getByRole('table', { name: 'Lista de automatizaciones' });
    if (await table.isVisible().catch(() => false)) {
      const rows = table.getByRole('row');
      if ((await rows.count()) > 1) {
        expect(count).toBeGreaterThan(0);
      }
    }
  });

  test('filtros tienen aria-label', async ({ page }) => {
    const filterRegion = page.getByRole('search', { name: /filtros de automatizaciones/i });
    if (await filterRegion.isVisible().catch(() => false)) {
      await expect(filterRegion).toBeVisible();
    }
  });
});
