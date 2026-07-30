'use server';

import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const CreateOrganizationSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100).trim(),
  slug: z
    .string()
    .min(1, 'El identificador es requerido')
    .max(63)
    .regex(/^[a-z0-9-]+$/, 'Solo letras minúsculas, números y guiones'),
});

export type CreateOrganizationResult =
  { success: true; organizationId: string } | { success: false; error: string };

/**
 * Crea una organización de forma atómica via RPC.
 * La función SQL `create_organization_with_owner` ejecuta en una sola
 * transacción:
 *   1. INSERT en organizations
 *   2. INSERT en organization_members (role = 'owner')
 *   3. UPDATE en profiles (active_organization_id)
 */
export async function createOrganizationAction(
  formData: FormData,
): Promise<CreateOrganizationResult> {
  const rawName = formData.get('name');
  const rawSlug = formData.get('slug');

  const parsed = CreateOrganizationSchema.safeParse({
    name: typeof rawName === 'string' ? rawName : '',
    slug: typeof rawSlug === 'string' ? rawSlug : '',
  });

  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return {
      success: false,
      error: firstError?.message ?? 'Datos inválidos.',
    };
  }

  const supabase = await createServerSupabaseClient();

  // Verificar sesión
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Sesión expirada. Por favor inicia sesión de nuevo.' };
  }

  // Llamar a la RPC atómica
  const { data, error } = await supabase.rpc('create_organization_with_owner', {
    organization_name: parsed.data.name,
    organization_slug: parsed.data.slug,
  });

  if (error) {
    // Slug duplicado → unique violation
    if (error.code === '23505' || error.message.includes('unique')) {
      return {
        success: false,
        error: 'El identificador ya está en uso. Elige uno diferente.',
      };
    }
    return {
      success: false,
      error: 'No se pudo crear la organización. Intenta de nuevo.',
    };
  }

  return { success: true, organizationId: data as string };
}
