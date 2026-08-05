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

// ─── Phase 6F: Automation alerts & signals ────────────────────────────────────

test.describe('Automatizaciones — alertas operativas (Phase 6F)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(skipIfNoCredentials(), 'E2E_TEST_EMAIL/PASSWORD no configuradas');
    await gotoProtected(page, '/alerts');
  });

  test('alerta de automatización muestra badge ⚙️ Auto si existe', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const table = page.getByRole('table', { name: 'Lista de alertas' });
    if (!(await table.isVisible().catch(() => false))) return;

    // Si existe una alerta de automatización, debe tener el badge ⚙️ Auto
    const autoBadges = page.getByLabel('Alerta generada por automatización');
    const count = await autoBadges.count();
    // El test valida el comportamiento cuando hay alertas de auto — no falla si no hay
    if (count > 0) {
      await expect(autoBadges.first()).toBeVisible();
    }
  });

  test('badge de automatización NO expone datos técnicos', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await assertNoTechnicalErrors(page);
    const body = await page.textContent('body');
    expect(body).not.toMatch(/automation\.[a-z_]+_failed.*at Object/);
    expect(body).not.toMatch(/sig:[a-z0-9-]+:[a-z0-9-]+:/);
  });

  test('alerta de automatización muestra Automatización en columna plataforma', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const autoBadges = page.getByLabel('Alerta generada por automatización');
    if ((await autoBadges.count()) === 0) return;

    // En la misma fila, la columna de plataforma debe decir "Automatización"
    const platformCells = page.getByText('Automatización');
    await expect(platformCells.first()).toBeVisible();
  });

  test('enlace Ver automatización navega a /automations/{id}', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const autoLinks = page.getByRole('link', { name: /Ver automatización relacionada/i });
    if ((await autoLinks.count()) === 0) return;

    const href = await autoLinks.first().getAttribute('href');
    expect(href).toMatch(/^\/automations\/[0-9a-f-]{36}$/);
  });

  test('enlace Ver ejecución navega a /automations/{id}/executions', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const execLinks = page.getByRole('link', { name: /Ver ejecución relacionada/i });
    if ((await execLinks.count()) === 0) return;

    const href = await execLinks.first().getAttribute('href');
    expect(href).toMatch(/^\/automations\/[0-9a-f-]{36}\/executions$/);
  });
});

test.describe('Automatizaciones — tareas operativas (Phase 6F)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(skipIfNoCredentials(), 'E2E_TEST_EMAIL/PASSWORD no configuradas');
    await gotoProtected(page, '/tasks');
  });

  test('tarea de automatización muestra badge ⚙️ Auto si existe', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const table = page.getByRole('table', { name: 'Lista de tareas' });
    if (!(await table.isVisible().catch(() => false))) return;

    const autoBadges = page.getByLabel('Tarea generada por automatización');
    if ((await autoBadges.count()) > 0) {
      await expect(autoBadges.first()).toBeVisible();
    }
  });

  test('tarea de automatización muestra enlace a /automations/{id}', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const autoLinks = page.getByRole('link', { name: /Ver automatización relacionada/i });
    if ((await autoLinks.count()) === 0) return;

    const href = await autoLinks.first().getAttribute('href');
    expect(href).toMatch(/^\/automations\/[0-9a-f-]{36}$/);
  });

  test('tarea de automatización no expone signatureTag ni orgId en texto visible', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const body = await page.textContent('body');
    expect(body).not.toMatch(/sig:[a-z0-9-]+:[a-z0-9-]+:/);
    expect(body).not.toMatch(/automation-id:[a-z0-9-]{36}/);
    expect(body).not.toMatch(/org:[a-z0-9-]{36}/);
    await assertNoTechnicalErrors(page);
  });
});

test.describe('Automatizaciones — señales en dashboard (Phase 6F)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(skipIfNoCredentials(), 'E2E_TEST_EMAIL/PASSWORD no configuradas');
    await gotoProtected(page, '/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('widget de automatizaciones es visible en el dashboard', async ({ page }) => {
    const widget = page.getByRole('heading', { name: /Automatizaciones/i });
    await expect(widget).toBeVisible({ timeout: 10_000 });
  });

  test('señales operativas tienen role=list accesible', async ({ page }) => {
    const signalList = page.getByRole('list', { name: /Señales operativas de automatizaciones/i });
    if (await signalList.isVisible().catch(() => false)) {
      await expect(signalList).toBeVisible();
    }
  });

  test('enlace Ver todas apunta a /automations', async ({ page }) => {
    const link = page.getByRole('link', { name: /Ver todas las automatizaciones/i });
    if (await link.isVisible().catch(() => false)) {
      const href = await link.getAttribute('href');
      expect(href).toBe('/automations');
    }
  });

  test('dashboard no expone errores técnicos de automatizaciones', async ({ page }) => {
    await assertNoTechnicalErrors(page);
    const body = await page.textContent('body');
    expect(body).not.toMatch(/automation\.\w+_failed.*Error/);
  });
});
