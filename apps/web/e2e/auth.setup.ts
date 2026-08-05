/**
 * Playwright auth setup — BopIAgency
 *
 * Autentica al usuario de prueba contra Supabase y guarda el storageState
 * para reutilizarlo en todos los tests E2E (evita login repetido por test).
 *
 * Variables de entorno requeridas:
 *   E2E_TEST_EMAIL    — email del usuario de prueba
 *   E2E_TEST_PASSWORD — contraseña del usuario de prueba
 *
 * El archivo e2e/.auth/user.json está en .gitignore — no se versiona.
 */
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.join(__dirname, '.auth/user.json');

setup('autenticar usuario de prueba', async ({ page }) => {
  const email = process.env['E2E_TEST_EMAIL'];
  const password = process.env['E2E_TEST_PASSWORD'];

  if (!email || !password) {
    console.warn(
      '[E2E] Saltando autenticación: E2E_TEST_EMAIL / E2E_TEST_PASSWORD no definidas.\n' +
        '      Los tests E2E requieren un usuario de prueba en Supabase.\n' +
        '      Documentar en PHASE_5E_E2E_REPORT.md como limitación.',
    );
    // Guardar estado vacío para que los demás proyectos no fallen en setup
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  // Ir a login
  await page.goto('/login');
  await expect(page).toHaveURL(/login/);

  // Completar formulario
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/contraseña|password/i).fill(password);
  await page.getByRole('button', { name: /iniciar sesión|sign in|entrar/i }).click();

  // Esperar redirección al dashboard tras login exitoso
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });

  // Si hay onboarding, completarlo no es parte de E2E — documentar como pre-requisito
  if (page.url().includes('/onboarding')) {
    throw new Error(
      'El usuario de prueba no tiene organización activa. ' +
        'Completar el onboarding manualmente antes de ejecutar E2E.',
    );
  }

  await expect(page).toHaveURL(/dashboard/);

  // Guardar state de autenticación
  await page.context().storageState({ path: AUTH_FILE });
});
