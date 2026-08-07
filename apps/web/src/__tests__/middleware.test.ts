import { describe, expect, it } from 'vitest';
import { isPublicRoute } from '../middleware';

/**
 * Regresión: /api/webhooks/n8n (y cualquier ruta bajo /api/webhooks) debe
 * quedar excluida de la autenticación por cookie de sesión del middleware.
 *
 * Motivo: estas rutas se autentican por HMAC (ver
 * apps/web/src/app/api/webhooks/n8n/route.ts), no por sesión de Supabase. Un
 * callback real de n8n nunca lleva cookie de sesión, por lo que si el
 * middleware la interceptara redirigiría el callback a /login (302) en lugar
 * de dejarlo llegar al route handler. Este defecto se detectó a través de un
 * falso negativo en scripts/local/verify-phase6-n8n.ps1: el precheck seguía
 * la redirección y reportaba HTTP 200 (la página de login), ocultando el
 * problema real.
 */
describe('middleware isPublicRoute', () => {
  it('excluye la ruta de callback de n8n de la autenticación por sesión', () => {
    expect(isPublicRoute('/api/webhooks/n8n')).toBe(true);
  });

  it('excluye cualquier ruta futura bajo el prefijo /api/webhooks', () => {
    expect(isPublicRoute('/api/webhooks/otro-proveedor')).toBe(true);
  });

  it('sigue exigiendo autenticación para rutas protegidas normales', () => {
    expect(isPublicRoute('/automations')).toBe(false);
    expect(isPublicRoute('/dashboard')).toBe(false);
  });

  it('sigue considerando públicas las rutas de auth y los assets existentes', () => {
    expect(isPublicRoute('/login')).toBe(true);
    expect(isPublicRoute('/api/health')).toBe(true);
    expect(isPublicRoute('/_next/static/chunk.js')).toBe(true);
  });

  it('no marca como pública una ruta con un prefijo distinto', () => {
    expect(isPublicRoute('/api/webhook')).toBe(false); // '/api/webhook' (singular) no es '/api/webhooks'
    expect(isPublicRoute('/api/other')).toBe(false);
  });
});
