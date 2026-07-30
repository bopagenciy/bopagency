'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// ─── Tipos de resultado ────────────────────────────────────────────────────

export type ActionResult = { success: true } | { success: false; error: string };

// ─── Schemas ───────────────────────────────────────────────────────────────

const UpdateProfileSchema = z.object({
  fullName: z.string().max(200).trim().optional(),
});

const UpdatePreferencesSchema = z.object({
  language: z.enum(['es', 'en']),
  timezone: z.string().min(1).max(100),
  emailNotifications: z.boolean(),
});

const SwitchOrganizationSchema = z.object({
  organizationId: z.string().uuid('ID de organización inválido'),
});

// ─── Helper: obtener usuario autenticado ───────────────────────────────────

async function getAuthenticatedUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, supabase } as const;
  }
  return { user, supabase } as const;
}

// ─── updateProfileAction ───────────────────────────────────────────────────

/**
 * Actualiza el nombre completo del perfil del usuario.
 * Validación + autenticación en servidor.
 */
export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  const rawFullName = formData.get('fullName');

  const parsed = UpdateProfileSchema.safeParse({
    fullName: typeof rawFullName === 'string' ? rawFullName : undefined,
  });

  if (!parsed.success) {
    return { success: false, error: 'Nombre inválido.' };
  }

  const { user, supabase } = await getAuthenticatedUser();
  if (!user) {
    return { success: false, error: 'Sesión expirada.' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.fullName ?? null })
    .eq('id', user.id);

  if (error) {
    return { success: false, error: 'No se pudo guardar el perfil. Intenta de nuevo.' };
  }

  revalidatePath('/settings');
  return { success: true };
}

// ─── updatePreferencesAction ───────────────────────────────────────────────

/**
 * Actualiza idioma, zona horaria y notificaciones por email del usuario.
 */
export async function updatePreferencesAction(formData: FormData): Promise<ActionResult> {
  const rawEmailNotifications = formData.get('emailNotifications');

  const parsed = UpdatePreferencesSchema.safeParse({
    language: formData.get('language'),
    timezone: formData.get('timezone'),
    emailNotifications: rawEmailNotifications === 'true',
  });

  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { success: false, error: firstError?.message ?? 'Datos inválidos.' };
  }

  const { user, supabase } = await getAuthenticatedUser();
  if (!user) {
    return { success: false, error: 'Sesión expirada.' };
  }

  const { error } = await supabase
    .from('user_preferences')
    .update({
      language: parsed.data.language,
      timezone: parsed.data.timezone,
      email_notifications: parsed.data.emailNotifications,
    })
    .eq('user_id', user.id);

  if (error) {
    return { success: false, error: 'No se pudieron guardar las preferencias. Intenta de nuevo.' };
  }

  revalidatePath('/settings');
  return { success: true };
}

// ─── switchActiveOrganizationAction ───────────────────────────────────────

/**
 * Cambia la organización activa del usuario.
 * Verifica membresía antes de actualizar el perfil.
 */
export async function switchActiveOrganizationAction(
  organizationId: string,
): Promise<ActionResult> {
  const parsed = SwitchOrganizationSchema.safeParse({ organizationId });
  if (!parsed.success) {
    return { success: false, error: 'ID de organización inválido.' };
  }

  const { user, supabase } = await getAuthenticatedUser();
  if (!user) {
    return { success: false, error: 'Sesión expirada.' };
  }

  // Verificar membresía activa en esa organización
  const { data: membership, error: memberError } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', parsed.data.organizationId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  if (memberError || !membership) {
    return { success: false, error: 'No tienes acceso a esa organización.' };
  }

  // Actualizar user_preferences (fuente de verdad para la org activa)
  const { error } = await supabase
    .from('user_preferences')
    .update({ active_organization_id: parsed.data.organizationId })
    .eq('user_id', user.id);

  if (error) {
    return { success: false, error: 'No se pudo cambiar la organización activa.' };
  }

  revalidatePath('/');
  return { success: true };
}
