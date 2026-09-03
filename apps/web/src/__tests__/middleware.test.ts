// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { isPublicRoute, middleware } from '../middleware';
import * as supabaseMiddleware from '@/lib/supabase/middleware';

vi.mock('@/lib/supabase/middleware', () => ({
  createMiddlewareClient: vi.fn(),
}));

/**
 * Regresión: /api/webhooks/n8n (y cualquier ruta bajo /api/webhooks) debe
 * quedar excluida de la autenticación por cookie de sesión del middleware.
 *
 * Motivo: estas rutas se autentican por HMAC (ver
 * apps/web/src/app/api/webhooks/n8n/route.ts), no por sesión de Supabase. Un
 * callback real de n8n nunca lleva cookie de sesión, por lo que si el
 * middleware la interceptara redirigiría el callback a /login (302) en lugar
 * de dejarlo llegar al route handler.
 *
 * Fase 9B.4: /api/cron/metrics-sync (y cualquier ruta bajo /api/cron) debe
 * quedar igualmente excluida de la autenticación por cookie de sesión del
 * middleware. Se autentica por header Authorization Bearer <CRON_SECRET>.
 */
describe('middleware isPublicRoute', () => {
  it('excluye la ruta de callback de n8n de la autenticación por sesión', () => {
    expect(isPublicRoute('/api/webhooks/n8n')).toBe(true);
  });

  it('excluye cualquier ruta futura bajo el prefijo /api/webhooks', () => {
    expect(isPublicRoute('/api/webhooks/otro-proveedor')).toBe(true);
  });

  it('excluye la ruta de metrics-sync cron de la autenticación por sesión', () => {
    expect(isPublicRoute('/api/cron/metrics-sync')).toBe(true);
  });

  it('excluye cualquier ruta futura bajo el prefijo /api/cron', () => {
    expect(isPublicRoute('/api/cron/other-task')).toBe(true);
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
    expect(isPublicRoute('/api/cro')).toBe(false);
    expect(isPublicRoute('/api/other')).toBe(false);
  });
});

describe('middleware execution flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('/api/cron/metrics-sync bypasses Supabase client and does not redirect to /login', async () => {
    const req = new NextRequest(new Request('http://localhost:3000/api/cron/metrics-sync'));
    const res = await middleware(req);

    expect(supabaseMiddleware.createMiddlewareClient).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
    expect(res.status).toBe(200);
  });

  it('/api/webhooks/n8n bypasses Supabase client and does not redirect to /login', async () => {
    const req = new NextRequest(new Request('http://localhost:3000/api/webhooks/n8n'));
    const res = await middleware(req);

    expect(supabaseMiddleware.createMiddlewareClient).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBeNull();
    expect(res.status).toBe(200);
  });

  it('anonymous user accessing protected /dashboard redirects to /login', async () => {
    const mockGetUser = vi.fn().mockResolvedValue({ data: { user: null } });
    const mockSupabaseResponse = vi.fn();
    vi.mocked(supabaseMiddleware.createMiddlewareClient).mockReturnValue({
      supabase: {
        auth: {
          getUser: mockGetUser,
        },
      },
      supabaseResponse: mockSupabaseResponse,
    } as unknown as ReturnType<typeof supabaseMiddleware.createMiddlewareClient>);

    const req = new NextRequest(new Request('http://localhost:3000/dashboard'));
    const res = await middleware(req);

    expect(supabaseMiddleware.createMiddlewareClient).toHaveBeenCalled();
    expect(res.headers.get('location')).toContain('/login');
    expect(res.headers.get('location')).toContain('redirectTo=%2Fdashboard');
    expect(res.status).toBe(307);
  });
});
