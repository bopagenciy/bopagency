/**
 * Helpers compartidos para tests E2E de BopIAgency.
 */
import { type Page, expect } from '@playwright/test';

/** Salta el test si no hay credenciales E2E configuradas. */
export function skipIfNoCredentials() {
  if (!process.env['E2E_TEST_EMAIL'] || !process.env['E2E_TEST_PASSWORD']) {
    return true;
  }
  return false;
}

/** Navega a una ruta y espera que el layout protegido esté visible. */
export async function gotoProtected(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  // Si redirige a login, la sesión expiró
  if (page.url().includes('/login')) {
    throw new Error(`Sesión expirada o inválida al navegar a ${path}`);
  }
  // Esperar señal estable del AppShell: único <main> visible
  await page.getByRole('main').waitFor({ state: 'visible', timeout: 15_000 });
}

/** Verifica que no hay errores técnicos visibles (stack traces, SQL, etc.). */
export async function assertNoTechnicalErrors(page: Page) {
  const body = await page.textContent('body');
  const leakPatterns = [
    /at Object\.<anonymous>/,
    /PostgreSQL/i,
    /supabase\.co/,
    /RLS/,
    /PGRST/,
    /anon_key/i,
    /service_role/i,
  ];
  for (const pattern of leakPatterns) {
    expect(body ?? '', `Posible fuga técnica: ${pattern}`).not.toMatch(pattern);
  }
}

/** Verifica el título h1 de la página. */
export async function assertPageHeading(page: Page, text: string | RegExp) {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(text);
}

export type WaitForTableOrEmptyOptions = {
  /** aria-label exacto de la tabla */
  tableLabel: string;
  /** Texto exacto del heading del EmptyState */
  emptyHeading: string;
};

/**
 * Espera a que la tabla principal cargue (o muestre su EmptyState).
 * Usa selectores de rol precisos para evitar coincidencias ambiguas.
 */
export async function waitForTableOrEmpty(
  page: Page,
  options: WaitForTableOrEmptyOptions,
): Promise<void> {
  const { tableLabel, emptyHeading } = options;
  await Promise.race([
    page.getByRole('table', { name: tableLabel, exact: true }).waitFor({ timeout: 10_000 }),
    page.getByRole('heading', { name: emptyHeading, exact: true }).waitFor({ timeout: 10_000 }),
  ]);
}
