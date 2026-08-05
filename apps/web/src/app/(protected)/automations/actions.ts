'use server';

/**
 * Automation Server Actions — Phase 6E
 *
 * Mutaciones seguras para automatizaciones y sus ejecuciones:
 *
 * Estado de automatización (rol mínimo admin):
 *   activateAutomationAction  — draft/paused → active
 *   pauseAutomationAction     — active → paused
 *   archiveAutomationAction   — any → archived
 *
 * Ejecuciones (rol mínimo operator):
 *   startExecutionAction      — crear y despachar ejecución manual
 *   cancelExecutionAction     — cancelar ejecución en curso
 *   retryExecutionAction      — reintentar ejecución fallida
 *
 * Seguridad:
 * - organizationId SIEMPRE se obtiene de la sesión del servidor.
 * - actorUserId se obtiene de la sesión (nunca del cliente).
 * - Validación Zod antes de cualquier operación.
 * - Rol verificado con requireOrganizationRole antes de ejecutar.
 * - revalidatePath solo en éxito.
 * - Errores técnicos no se exponen al cliente.
 * - NO se usa service_role en ningún punto.
 */

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireOrganizationRole } from '@/lib/auth/server';
import { createAutomationComposition } from '@/lib/composition/automation.composition';
import {
  activateAutomationSchema,
  pauseAutomationSchema,
  archiveAutomationSchema,
  startExecutionSchema,
  cancelExecutionSchema,
  retryExecutionSchema,
} from '@bop-agency/shared';
import type { AutomationId, AutomationExecutionId, OrganizationId } from '@bop-agency/domain';

// ─── Result type ──────────────────────────────────────────────────────────────

type ActionSuccess<T = undefined> = { ok: true; data?: T };
type ActionFailure = { ok: false; error: string; code: string };
export type ActionResult<T = undefined> = ActionSuccess<T> | ActionFailure;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapError(code: string, message: string): ActionFailure {
  if (code === 'NOT_FOUND') return { ok: false, error: 'Automatización no encontrada', code };
  if (code === 'VALIDATION_ERROR') return { ok: false, error: message, code };
  if (code === 'FORBIDDEN') return { ok: false, error: 'Sin permisos para esta acción', code };
  if (code === 'CONFLICT') return { ok: false, error: message, code };
  if (code === 'CANCEL_NOT_SUPPORTED') return { ok: false, error: 'Esta ejecución no puede cancelarse remotamente', code };
  return { ok: false, error: 'Error interno. Intenta de nuevo.', code: 'INTERNAL_ERROR' };
}

function mapExecutionError(code: string, message: string): ActionFailure {
  if (code === 'NOT_FOUND') return { ok: false, error: 'Ejecución no encontrada', code };
  if (code === 'VALIDATION_ERROR') return { ok: false, error: message, code };
  if (code === 'CANCEL_NOT_SUPPORTED') return { ok: false, error: 'Esta ejecución no puede cancelarse remotamente', code };
  if (code === 'EXTERNAL_SERVICE_ERROR') return { ok: false, error: 'Error al comunicarse con el motor de automatización', code };
  return { ok: false, error: 'Error interno. Intenta de nuevo.', code: 'INTERNAL_ERROR' };
}

// ─── activateAutomationAction ─────────────────────────────────────────────────

/**
 * Activa una automatización (draft/paused → active).
 * Rol mínimo: admin.
 */
export async function activateAutomationAction(payload: unknown): Promise<ActionResult> {
  const parsed = activateAutomationSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join('; '), code: 'VALIDATION_ERROR' };
  }

  let context: Awaited<ReturnType<typeof requireOrganizationRole>>;
  try {
    context = await requireOrganizationRole('admin');
  } catch {
    return { ok: false, error: 'Sin permisos para activar automatizaciones', code: 'FORBIDDEN' };
  }

  const { organization } = context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createAutomationComposition(supabase);

  const result = await useCases.activateAutomation({
    automationId: parsed.data.automationId as AutomationId,
    organizationId: organization.id as OrganizationId,
  });

  if (!result.success) return mapError(result.error.code, result.error.message);

  revalidatePath('/automations');
  revalidatePath(`/automations/${parsed.data.automationId}`);
  return { ok: true };
}

// ─── pauseAutomationAction ────────────────────────────────────────────────────

/**
 * Pausa una automatización activa.
 * Rol mínimo: operator.
 */
export async function pauseAutomationAction(payload: unknown): Promise<ActionResult> {
  const parsed = pauseAutomationSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join('; '), code: 'VALIDATION_ERROR' };
  }

  let context: Awaited<ReturnType<typeof requireOrganizationRole>>;
  try {
    context = await requireOrganizationRole('operator');
  } catch {
    return { ok: false, error: 'Sin permisos para pausar automatizaciones', code: 'FORBIDDEN' };
  }

  const { organization } = context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createAutomationComposition(supabase);

  const result = await useCases.pauseAutomation({
    automationId: parsed.data.automationId as AutomationId,
    organizationId: organization.id as OrganizationId,
  });

  if (!result.success) return mapError(result.error.code, result.error.message);

  revalidatePath('/automations');
  revalidatePath(`/automations/${parsed.data.automationId}`);
  return { ok: true };
}

// ─── archiveAutomationAction ──────────────────────────────────────────────────

/**
 * Archiva una automatización (estado final).
 * Rol mínimo: admin.
 */
export async function archiveAutomationAction(payload: unknown): Promise<ActionResult> {
  const parsed = archiveAutomationSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join('; '), code: 'VALIDATION_ERROR' };
  }

  let context: Awaited<ReturnType<typeof requireOrganizationRole>>;
  try {
    context = await requireOrganizationRole('admin');
  } catch {
    return { ok: false, error: 'Sin permisos para archivar automatizaciones', code: 'FORBIDDEN' };
  }

  const { organization } = context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createAutomationComposition(supabase);

  const result = await useCases.archiveAutomation({
    automationId: parsed.data.automationId as AutomationId,
    organizationId: organization.id as OrganizationId,
  });

  if (!result.success) return mapError(result.error.code, result.error.message);

  revalidatePath('/automations');
  revalidatePath(`/automations/${parsed.data.automationId}`);
  return { ok: true };
}

// ─── startExecutionAction ─────────────────────────────────────────────────────

/**
 * Inicia una ejecución manual de una automatización.
 * Rol mínimo: operator.
 */
export async function startExecutionAction(payload: unknown): Promise<ActionResult> {
  const parsed = startExecutionSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join('; '), code: 'VALIDATION_ERROR' };
  }

  let context: Awaited<ReturnType<typeof requireOrganizationRole>>;
  try {
    context = await requireOrganizationRole('operator');
  } catch {
    return { ok: false, error: 'Sin permisos para iniciar ejecuciones', code: 'FORBIDDEN' };
  }

  const { user, organization } = context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createAutomationComposition(supabase);

  const result = await useCases.startExecution({
    automationId: parsed.data.automationId as AutomationId,
    organizationId: organization.id as OrganizationId,
    clientId: null,
    triggeredBy: user.id,
    triggerType: 'manual',
    inputMetadata: parsed.data.metadata ?? {},
  });

  if (!result.success) return mapExecutionError(result.error.code, result.error.message);

  revalidatePath(`/automations/${parsed.data.automationId}`);
  revalidatePath(`/automations/${parsed.data.automationId}/executions`);
  return { ok: true };
}

// ─── cancelExecutionAction ────────────────────────────────────────────────────

/**
 * Cancela una ejecución en curso (queued o running).
 * Rol mínimo: operator.
 */
export async function cancelExecutionAction(payload: unknown): Promise<ActionResult> {
  const parsed = cancelExecutionSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join('; '), code: 'VALIDATION_ERROR' };
  }

  let context: Awaited<ReturnType<typeof requireOrganizationRole>>;
  try {
    context = await requireOrganizationRole('operator');
  } catch {
    return { ok: false, error: 'Sin permisos para cancelar ejecuciones', code: 'FORBIDDEN' };
  }

  const { user, organization } = context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createAutomationComposition(supabase);

  const result = await useCases.cancelExecution({
    executionId: parsed.data.executionId as AutomationExecutionId,
    organizationId: organization.id as OrganizationId,
    requestedBy: user.id,
  });

  if (!result.success) return mapExecutionError(result.error.code, result.error.message);

  revalidatePath('/automations');
  revalidatePath('/automations/executions/' + parsed.data.executionId);
  return { ok: true };
}

// ─── retryExecutionAction ─────────────────────────────────────────────────────

/**
 * Reintenta una ejecución fallida.
 * Rol mínimo: operator.
 * Nota: si el backoff está activo, retorna retryDeferred: true (sin ejecución creada).
 */
export async function retryExecutionAction(payload: unknown): Promise<ActionResult<{ retryDeferred: boolean }>> {
  const parsed = retryExecutionSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors.map((e) => e.message).join('; '), code: 'VALIDATION_ERROR' };
  }

  let context: Awaited<ReturnType<typeof requireOrganizationRole>>;
  try {
    context = await requireOrganizationRole('operator');
  } catch {
    return { ok: false, error: 'Sin permisos para reintentar ejecuciones', code: 'FORBIDDEN' };
  }

  const { user, organization } = context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createAutomationComposition(supabase);

  const result = await useCases.retryExecution({
    executionId: parsed.data.executionId as AutomationExecutionId,
    organizationId: organization.id as OrganizationId,
    requestedBy: user.id,
  });

  if (!result.success) return mapExecutionError(result.error.code, result.error.message);

  // Solo revalidar si se creó una ejecución nueva (no deferred)
  if (!result.value.retryDeferred) {
    revalidatePath('/automations');
    revalidatePath('/automations/executions/' + parsed.data.executionId);
  }

  return { ok: true, data: { retryDeferred: result.value.retryDeferred } };
}
