/**
 * Supabase Middleware Client
 *
 * Crea un cliente Supabase para el middleware de Next.js.
 * Opera sobre NextRequest/NextResponse (no sobre next/headers).
 * Refresca el access token expirado antes de que llegue al Server Component.
 *
 * ⚠️ NextResponse debe importarse como VALOR (no como tipo) porque
 *    se usa para crear respuestas nuevas dentro de setAll.
 */
/**
 * Supabase Middleware Client
 *
 * Crea un cliente Supabase para el middleware de Next.js.
 * Opera sobre NextRequest/NextResponse (no sobre next/headers).
 * Refresca el access token expirado antes de que llegue al Server Component.
 *
 * Compatibilidad con @supabase/ssr ≥0.12:
 * - setAll recibe un segundo argumento `headers` con directivas de cache
 *   (Cache-Control, Expires, Pragma) que se deben propagar en la respuesta
 *   para evitar que CDNs cacheen tokens de sesión de otros usuarios.
 *
 * ⚠️ NextResponse debe importarse como VALOR (no como tipo) porque
 *    se usa para crear respuestas nuevas dentro de setAll.
 */
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
// NextResponse se importa como valor porque se usa en setAll()
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Database } from './types';

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export function createMiddlewareClient(request: NextRequest, response: NextResponse) {
  let supabaseResponse = response;

  const supabase = createServerClient<Database>(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[], headers?: Record<string, string>) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
          // Propagar Cache-Control headers para evitar caching de tokens
          if (headers) {
            for (const [key, val] of Object.entries(headers)) {
              supabaseResponse.headers.set(key, val);
            }
          }
        },
      },
    },
  );

  return { supabase, supabaseResponse: () => supabaseResponse };
}
