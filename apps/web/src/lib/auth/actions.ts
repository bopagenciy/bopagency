'use server';

/**
 * Server Actions de Autenticación
 *
 * Todas las acciones:
 * - Validan input con Zod antes de llamar a Supabase
 * - Nunca exponen errores internos de Supabase al cliente
 * - Usan redirect() de Next.js para navegar tras la acción
 *
 * REGLAS DE SEGURIDAD:
 * - No usar SUPABASE_SERVICE_ROLE_KEY aquí (son acciones de auth del usuario)
 * - No exponer mensajes de error de Supabase que revelen información del sistema
 * - Las contraseñas nunca se loguean
 */
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  SignInSchema,
  SignUpSchema,
  RequestPasswordResetSchema,
  UpdatePasswordSchema,
  ResendConfirmationSchema,
} from './schemas';
import { buildRedirectUrl } from './url';

// --- Actions ---

/**
 * Inicia sesión con email y contraseña.
 * Redirige al dashboard (o a redirectTo) si tiene éxito.
 * Redirige a /login?error=... si falla.
 */
export async function signIn(formData: FormData): Promise<void> {
  const rawData = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    redirectTo: (formData.get('redirectTo') as string | null) ?? undefined,
  };

  const parsed = SignInSchema.safeParse(rawData);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Datos inválidos';
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Normalizar el mensaje de error sin revelar detalles del sistema
    const userMessage = error.message.includes('Invalid login credentials')
      ? 'Email o contraseña incorrectos'
      : error.message.includes('Email not confirmed')
        ? 'Debes confirmar tu email antes de iniciar sesión'
        : 'No se pudo iniciar sesión. Intenta de nuevo.';

    redirect(`/login?error=${encodeURIComponent(userMessage)}`);
  }

  redirect(parsed.data.redirectTo ?? '/dashboard');
}

/**
 * Registra un nuevo usuario.
 * Redirige a /login?message=... pidiendo confirmar email.
 */
export async function signUp(formData: FormData): Promise<void> {
  const rawData = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    fullName: formData.get('fullName') as string,
  };

  const parsed = SignUpSchema.safeParse(rawData);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Datos inválidos';
    redirect(`/signup?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
      },
      emailRedirectTo: buildRedirectUrl('/auth/confirm?type=signup'),
    },
  });

  if (error) {
    const userMessage =
      error.message.includes('already registered') ||
      error.message.includes('already been registered')
        ? 'Ya existe una cuenta con este email'
        : 'No se pudo crear la cuenta. Intenta de nuevo.';

    redirect(`/signup?error=${encodeURIComponent(userMessage)}`);
  }

  redirect(
    `/login?message=${encodeURIComponent('Revisa tu email para confirmar tu cuenta antes de iniciar sesión.')}`,
  );
}

/**
 * Cierra la sesión actual.
 * Redirige a /login.
 */
export async function signOut(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect('/login');
}

/**
 * Solicita el envío de un enlace de recuperación de contraseña.
 */
export async function requestPasswordReset(formData: FormData): Promise<void> {
  const rawData = {
    email: formData.get('email') as string,
  };

  const parsed = RequestPasswordResetSchema.safeParse(rawData);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Email inválido';
    redirect(`/forgot-password?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createServerSupabaseClient();
  // Siempre retornamos éxito para no revelar si el email existe
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: buildRedirectUrl('/auth/callback?next=/reset-password'),
  });

  redirect(
    `/forgot-password?message=${encodeURIComponent('Si tu email está registrado, recibirás un enlace para restablecer tu contraseña.')}`,
  );
}

/**
 * Actualiza la contraseña del usuario autenticado.
 * Solo funciona cuando el usuario llegó desde el enlace de recuperación y tiene sesión activa.
 */
export async function updatePassword(formData: FormData): Promise<void> {
  const rawData = {
    password: formData.get('password') as string,
    confirmPassword: formData.get('confirmPassword') as string,
  };

  const parsed = UpdatePasswordSchema.safeParse(rawData);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Datos inválidos';
    redirect(`/reset-password?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/reset-password?error=${encodeURIComponent('No hay una sesión activa de recuperación. Por favor solicita un nuevo enlace.')}`,
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    redirect(
      `/reset-password?error=${encodeURIComponent('No se pudo actualizar la contraseña. El enlace puede haber expirado.')}`,
    );
  }

  // Cerrar la sesión de recuperación para obligar a login limpio con la nueva contraseña
  await supabase.auth.signOut();

  redirect(
    `/login?message=${encodeURIComponent('Contraseña actualizada correctamente. Ya puedes iniciar sesión.')}`,
  );
}

/**
 * Reenvía el email de confirmación de cuenta.
 */
export async function resendConfirmation(formData: FormData): Promise<void> {
  const rawData = {
    email: formData.get('email') as string,
  };

  const parsed = ResendConfirmationSchema.safeParse(rawData);
  if (!parsed.success) {
    redirect(`/login?error=${encodeURIComponent('Email inválido')}`);
  }

  const supabase = await createServerSupabaseClient();
  await supabase.auth.resend({
    type: 'signup',
    email: parsed.data.email,
    options: {
      emailRedirectTo: buildRedirectUrl('/auth/confirm?type=signup'),
    },
  });

  // Siempre respuesta ambigua
  redirect(
    `/login?message=${encodeURIComponent('Si el email existe, recibirás un nuevo enlace de confirmación.')}`,
  );
}
