/**
 * Supabase Server Client
 *
 * ⚠️ SERVER-ONLY — Importar únicamente desde Server Components,
 *    Server Actions y Route Handlers. Nunca desde Client Components.
 *
 * Usa `import 'server-only'` para que Next.js / webpack lancen un error
 * en build si este módulo es importado en el bundle del cliente.
 *
 * Uso:
 *   - createServerSupabaseClient() → cliente con sesión del usuario + RLS
 *   - createAdminClient()          → cliente service_role sin RLS (solo admin)
 */
import 'server-only';

import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from './types';

// ─── Helpers de entorno ────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[Supabase] Variable de entorno requerida no encontrada: ${name}. ` +
        'Asegúrate de que .env.local existe y tiene el valor correcto.',
    );
  }
  return value;
}

// ─── Tipo de cookie interna ────────────────────────────────────────────────

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

// ─── Cliente servidor (con sesión del usuario + RLS) ──────────────────────

/**
 * Crea un cliente Supabase para Server Components, Server Actions y Route Handlers.
 * Lee y escribe cookies via `next/headers`. RLS aplicado automáticamente.
 *
 * En @supabase/ssr ≥0.12, setAll recibe un segundo argumento `headers`
 * con directivas de cache. En Server Components no podemos escribir headers
 * de respuesta, así que se ignora (el middleware los aplica antes del render).
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // setAll es opcional en @supabase/ssr ≥0.12 — se omite cuando
        // el entorno (Server Components) no puede escribir cookies/headers.
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Los Server Components (render path) no pueden escribir cookies.
            // El middleware refresca el token antes del render.
            // Este catch es intencional y no es un error real.
          }
        },
      },
    },
  );
}

// ─── Cliente admin (service_role — bypasea RLS) ───────────────────────────

/**
 * Crea un cliente Supabase con service_role_key.
 *
 * ❌ NUNCA importar desde Client Components.
 * ❌ NUNCA usar la key con el prefijo NEXT_PUBLIC_.
 * ✅ Usar solo para operaciones administrativas explícitamente autorizadas.
 */
export function createAdminClient() {
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createSupabaseAdminClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
