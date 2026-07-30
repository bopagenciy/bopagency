/**
 * Supabase Browser Client
 *
 * Usar ÚNICAMENTE en Client Components ('use client').
 * Usa la sesión del usuario actual (anon key + cookies).
 * Las RLS policies protegen los datos automáticamente.
 *
 * ⚠️ Este archivo NO debe importar `next/headers` ni `server.ts`.
 */
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

function requirePublicEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[Supabase] Variable de entorno requerida no encontrada: ${name}. ` +
        'Asegúrate de que .env.local existe y tiene el valor correcto.',
    );
  }
  return value;
}

/** Cliente Supabase para Client Components. Usa RLS con la sesión del usuario. */
export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    requirePublicEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requirePublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  );
}
