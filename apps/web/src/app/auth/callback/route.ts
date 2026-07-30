/**
 * Supabase Auth Callback Route
 *
 * Maneja el callback OAuth y magic link de Supabase.
 * Intercambia el `code` por una sesión y redirige al usuario.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Redirigir al destino solicitado o al dashboard
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Error en el intercambio de código
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent('No se pudo completar la autenticación. Intenta de nuevo.')}`,
  );
}
