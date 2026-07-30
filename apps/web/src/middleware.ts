/**
 * Next.js Middleware — Autenticación y protección de rutas
 *
 * Responsabilidades:
 * 1. Refrescar el access token de Supabase antes de cada request
 * 2. Redirigir a /login si la ruta requiere autenticación y no hay sesión
 * 3. Redirigir a /dashboard si hay sesión activa y se intenta acceder a rutas de auth
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/middleware';

// Rutas que NO requieren autenticación
const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/auth/confirm',
];

// Rutas de auth — si hay sesión activa, redirigir al dashboard
const AUTH_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password'];

// Rutas que siempre son públicas (assets, api routes especiales)
const ALWAYS_PUBLIC_PREFIXES = ['/_next', '/favicon', '/api/health'];

function isPublicRoute(pathname: string): boolean {
  if (ALWAYS_PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'));
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const response = NextResponse.next({ request });
  const { supabase, supabaseResponse } = createMiddlewareClient(request, response);

  // IMPORTANTE: No llamar a supabase.auth.getUser() sin getSession() primero
  // para evitar requests innecesarios. Usamos getUser() que también valida
  // el token con el servidor de Supabase (más seguro que getSession()).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Si tiene sesión y visita una ruta de auth → redirigir al dashboard
  if (user && isAuthRoute(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Si NO tiene sesión y visita una ruta protegida → redirigir al login
  if (!user && !isPublicRoute(pathname)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Propagar las cookies de sesión actualizadas
  return supabaseResponse();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - files with extensions (images, fonts, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$).*)',
  ],
};
