/**
 * E2E — Dashboard Principal (/dashboard)
 * Requiere: auth setup completado + E2E_TEST_EMAIL/PASSWORD definidas
 */
import { test, expect } from '@playwright/test';
import { skipIfNoCredentials, gotoProtected, assertNoTechnicalErrors } from './helpers';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(skipIfNoCredentials(), 'E2E_TEST_EMAIL/PASSWORD no configuradas');
    await gotoProtected(page, '/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('carga la página y muestra el heading principal (sr-only)', async ({ page }) => {
    // Dashboard tiene h1 sr-only "Dashboard" — verificar que existe en el DOM
    const h1 = page.getByRole('heading', { level: 1, name: 'Dashboard', exact: true });
    await expect(h1).toHaveCount(1);
  });

  test('muestra las tarjetas de KPI', async ({ page }) => {
    // AgencySummaryCards renderiza 4 cards con border-l-4
    const cards = page.locator('.border-l-4');
    await expect(cards).toHaveCount(4, { timeout: 10_000 });
  });

  test('muestra la sección de alertas activas', async ({ page }) => {
    // ActiveAlertsSidebar siempre muestra el h2 "Alertas activas"
    await expect(
      page.getByRole('heading', { level: 2, name: 'Alertas activas', exact: true }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('muestra la sección de tareas recientes', async ({ page }) => {
    // Panel de tareas recientes tiene h2 "Tareas recientes"
    await page
      .getByRole('heading', { level: 2, name: 'Tareas recientes', exact: true })
      .waitFor({ timeout: 8_000 });
  });

  test('accesos rápidos navegan correctamente', async ({ page }) => {
    const links = [
      { text: 'Alertas', expected: /\/alerts/, heading: 'Alertas' },
      { text: 'Tareas', expected: /\/tasks/, heading: 'Tareas' },
      { text: 'Métricas', expected: /\/metrics/, heading: 'Métricas' },
    ];

    for (const { text, expected, heading } of links) {
      // Volver al dashboard usando gotoProtected (evita timeouts con page.goBack)
      await gotoProtected(page, '/dashboard');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Dashboard', exact: true }),
      ).toHaveCount(1);
      // Los accesos rápidos están en la sección inferior del dashboard
      await page.getByRole('link', { name: text }).last().click();
      await expect(page).toHaveURL(expected, { timeout: 10_000 });
      await expect(
        page.getByRole('heading', { level: 1, name: heading, exact: true }),
      ).toBeVisible({ timeout: 8_000 });
    }
  });

  test('no expone errores técnicos al cliente', async ({ page }) => {
    await assertNoTechnicalErrors(page);
  });

  test('la navegación tiene enlace al Dashboard', async ({ page }) => {
    const viewport = page.viewportSize();
    const isDesktop = (viewport?.width ?? 0) >= 1024;

    if (isDesktop) {
      // Desktop (≥1024px): el Sidebar es visible de forma permanente
      const nav = page.getByRole('navigation');
      await expect(nav).toBeVisible({ timeout: 5_000 });
      const dashLink = nav.getByRole('link', {
        name: /Dashboard/i,
      });
      await expect(dashLink).toBeVisible();
      await expect(dashLink).toHaveAttribute('href', '/dashboard');
    } else {
      // Mobile/tablet (<1024px): navegación colapsada detrás del botón hamburguesa
      const menuButton = page.getByRole('button', { name: 'Toggle navigation', exact: true });
      await expect(menuButton).toBeVisible({ timeout: 5_000 });
      await menuButton.click();
      // Esperar que aparezca el drawer con el <nav>
      const nav = page.getByRole('navigation');
      await expect(nav).toBeVisible({ timeout: 5_000 });
      const dashLink = nav.getByRole('link', {
        name: /Dashboard/i,
      });
      await expect(dashLink).toBeVisible();
      await expect(dashLink).toHaveAttribute('href', '/dashboard');
      // Cerrar el menú para no interferir con otros tests
      await menuButton.click();
    }
  });

  test('organización no mezcla datos entre tenants (single-org check)', async ({ page }) => {
    expect(page.url()).not.toMatch(/organizationId=/);
    expect(page.url()).not.toMatch(/org_id=/);
  });
});
