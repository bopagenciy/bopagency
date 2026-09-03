/**
 * Supabase Auth Callback Route
 *
 * Maneja el callback OAuth y magic link de Supabase.
 * Intercambia el `code` por una sesión y redirige al usuario.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function sanitizeNext(next: string | null): string {
  if (!next) return '/dashboard';
  const trimmed = next.trim();
  // Validar que sea un path relativo seguro (debe empezar con / y no con // ni backslash)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) {
    return trimmed;
  }
  return '/dashboard';
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const cleanNext = sanitizeNext(searchParams.get('next'));

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Redirigir al destino solicitado o al dashboard
      return NextResponse.redirect(`${origin}${cleanNext}`);
    }
  }

  // Si el destino era reset-password y falló el code exchange, redirigir a reset-password con error claro
  if (cleanNext === '/reset-password') {
    return NextResponse.redirect(
      `${origin}/reset-password?error=${encodeURIComponent('El enlace de recuperación es inválido o ha expirado. Por favor solicita uno nuevo.')}`,
    );
  }

  // Error en el intercambio de código para login u otros flujos
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent('No se pudo completar la autenticación. Intenta de nuevo.')}`,
  );
}
