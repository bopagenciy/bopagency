'use server';

/**
 * Alert Server Actions — Phase 5C
 *
 * Mutaciones seguras para alertas:
 * - acknowledgeAlertAction: cualquier miembro (viewer+)
 * - resolveAlertAction: rol operator+
 *
 * Seguridad:
 * - organizationId SIEMPRE se obtiene de la sesión del servidor.
 * - actorUserId se obtiene de la sesión (nunca del cliente).
 * - Validación Zod antes de cualquier operación.
 * - Rol verificado con requireOrganizationRole antes de ejecutar.
 * - revalidatePath solo en éxito.
 * - Errores técnicos no se exponen al cliente.
 *
 * Audit trail:
 * - Las RPCs de Supabase registran acknowledged_by/acknowledged_at y
 *   resolved_by/resolved_at usando auth.uid() del contexto de BD.
 * - No existe tabla audit_logs dedicada en Phase 5C (ver PHASE_5C_CHANGELOG).
 */

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireOrganization, requireOrganizationRole } from '@/lib/auth/server';
import { SupabaseAlertRepository } from '@bop-agency/infrastructure';
import { acknowledgeAlert, resolveAlert } from '@bop-agency/application';
import { consoleLogger } from '@bop-agency/infrastructure';
import { acknowledgeAlertSchema, resolveAlertSchema } from '@bop-agency/shared';
import type { AlertId } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';

// ─── Discriminated result type ────────────────────────────────────────────────

type ActionSuccess = { ok: true };
type ActionFailure = { ok: false; error: string; code: string };
type ActionResult = ActionSuccess | ActionFailure;

// ─── acknowledgeAlertAction ───────────────────────────────────────────────────

/**
 * Reconoce una alerta activa.
 *
 * Rol mínimo: viewer (cualquier miembro de la organización).
 * La RPC `acknowledge_alert` verifica membership internamente (SECURITY DEFINER).
 */
export async function acknowledgeAlertAction(payload: unknown): Promise<ActionResult> {
  // 1. Validar payload con Zod
  const parsed = acknowledgeAlertSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors.map((e) => e.message).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  // 2. Autenticación y resolución de organización (viewer+)
  let context: Awaited<ReturnType<typeof requireOrganization>>;
  try {
    context = await requireOrganization();
  } catch {
    return {
      ok: false,
      error: 'No autenticado o sin organización activa',
      code: 'UNAUTHENTICATED',
    };
  }

  const { user, organization } = context;

  // 3. Instanciar repositorio y ejecutar caso de uso
  const supabase = await createServerSupabaseClient();
  const alertRepository = new SupabaseAlertRepository(supabase);

  const result = await acknowledgeAlert(
    {
      alertId: parsed.data.alertId as AlertId,
      organizationId: organization.id as OrganizationId,
      actorUserId: user.id,
    },
    { alertRepository, logger: consoleLogger },
  );

  // 4. Mapear errores sin exponer detalles técnicos
  if (!result.success) {
    const { code, message } = result.error;
    if (code === 'NOT_FOUND') {
      return { ok: false, error: 'Alerta no encontrada', code: 'NOT_FOUND' };
    }
    if (code === 'CONFLICT') {
      return { ok: false, error: message, code: 'CONFLICT' };
    }
    if (code === 'FORBIDDEN') {
      return { ok: false, error: 'Sin permisos para reconocer esta alerta', code: 'FORBIDDEN' };
    }
    return { ok: false, error: 'Error interno al reconocer la alerta', code: 'INTERNAL_ERROR' };
  }

  // 5. Revalidar solo en éxito
  revalidatePath('/alerts');
  revalidatePath('/dashboard');

  return { ok: true };
}

// ─── resolveAlertAction ───────────────────────────────────────────────────────

/**
 * Resuelve una alerta activa o reconocida.
 *
 * Rol mínimo: operator.
 * La RPC `resolve_alert` también verifica has_organization_role('operator')
 * internamente (SECURITY DEFINER), actuando como segunda barrera.
 */
export async function resolveAlertAction(payload: unknown): Promise<ActionResult> {
  // 1. Validar payload con Zod
  const parsed = resolveAlertSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors.map((e) => e.message).join('; '),
      code: 'VALIDATION_ERROR',
    };
  }

  // 2. Autenticación y verificación de rol mínimo operator
  let context: Awaited<ReturnType<typeof requireOrganizationRole>>;
  try {
    context = await requireOrganizationRole('operator');
  } catch {
    return { ok: false, error: 'Sin permisos para resolver alertas', code: 'FORBIDDEN' };
  }

  const { user, organization } = context;

  // 3. Instanciar repositorio y ejecutar caso de uso
  const supabase = await createServerSupabaseClient();
  const alertRepository = new SupabaseAlertRepository(supabase);

  const result = await resolveAlert(
    {
      alertId: parsed.data.alertId as AlertId,
      organizationId: organization.id as OrganizationId,
      actorUserId: user.id,
    },
    { alertRepository, logger: consoleLogger },
  );

  // 4. Mapear errores sin exponer detalles técnicos
  if (!result.success) {
    const { code, message } = result.error;
    if (code === 'NOT_FOUND') {
      return { ok: false, error: 'Alerta no encontrada', code: 'NOT_FOUND' };
    }
    if (code === 'CONFLICT') {
      return { ok: false, error: message, code: 'CONFLICT' };
    }
    if (code === 'FORBIDDEN') {
      return { ok: false, error: 'Sin permisos para resolver alertas', code: 'FORBIDDEN' };
    }
    return { ok: false, error: 'Error interno al resolver la alerta', code: 'INTERNAL_ERROR' };
  }

  // 5. Revalidar solo en éxito
  revalidatePath('/alerts');
  revalidatePath('/dashboard');

  return { ok: true };
}
