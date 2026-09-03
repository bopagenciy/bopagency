/**
 * url.ts — Helpers de resolución de URLs canónicas para autenticación.
 *
 * Determina la URL base de la aplicación con la siguiente jerarquía de fallbacks:
 * 1. NEXT_PUBLIC_APP_URL
 * 2. VERCEL_PROJECT_PRODUCTION_URL
 * 3. VERCEL_URL
 * 4. http://localhost:3200
 */

export function getAppUrl(): string {
  const rawUrl =
    process.env['NEXT_PUBLIC_APP_URL'] ||
    process.env['VERCEL_PROJECT_PRODUCTION_URL'] ||
    process.env['VERCEL_URL'] ||
    'http://localhost:3200';

  let trimmed = rawUrl.trim();
  if (!trimmed) {
    trimmed = 'http://localhost:3200';
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  return trimmed.replace(/\/+$/, '');
}

export function buildRedirectUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getAppUrl()}${normalizedPath}`;
}
