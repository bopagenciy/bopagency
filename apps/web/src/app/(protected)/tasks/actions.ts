'use server';

/**
 * Task Server Actions — Phase 5C
 *
 * Mutaciones seguras para tareas:
 * - updateTaskStatusAction: rol operator+
 *
 * Seguridad:
 * - organizationId SIEMPRE se obtiene de la sesión del servidor.
 * - actorUserId se obtiene de la sesión (nunca del cliente).
 * - Validación Zod antes de cualquier operación.
 * - Rol verificado con requireOrganizationRole('operator') antes de ejecutar.
 * - revalidatePath solo en éxito.
 * - Errores técnicos no se exponen al cliente.
 * - organizationId enviado por el cliente es ignorado — solo se usa el del servidor.
 *
 * Audit trail:
 * - tasks.updated_by y tasks.updated_at se actualizan en cada cambio de estado.
 * - No existe tabla audit_logs dedicada en Phase 5C (ver PHASE_5C_CHANGELOG).
 */

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireOrganizationRole } from '@/lib/auth/server';
import { SupabaseTaskRepository } from '@bop-agency/infrastructure';
import { updateTaskStatus } from '@bop-agency/application';
import { consoleLogger } from '@bop-agency/infrastructure';
import { updateTaskStatusSchema } from '@bop-agency/shared';
import type { TaskId } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';

// ─── Discriminated result type ────────────────────────────────────────────────

type ActionSuccess<T = void> = T extends void ? { ok: true } : { ok: true; data: T };
type ActionFailure = { ok: false; error: string; code: string };
type ActionResult<T = void> = ActionSuccess<T> | ActionFailure;

// ─── updateTaskStatusAction ───────────────────────────────────────────────────

/**
 * Cambia el estado de una tarea, respetando las reglas de transición del dominio.
 *
 * Rol mínimo: operator.
 * RLS también aplica la política tasks_update que exige operator+.
 *
 * Transiciones válidas:
 *   pending     → in_progress, cancelled
 *   in_progress → done, cancelled, blocked
 *   blocked     → in_progress, cancelled
 *   done        → (estado final — rechazado)
 *   cancelled   → (estado final — rechazado)
 */
export async function updateTaskStatusAction(payload: unknown): Promise<ActionResult> {
  // 1. Validar payload con Zod
  const parsed = updateTaskStatusSchema.safeParse(payload);
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
    return {
      ok: false,
      error: 'Sin permisos para cambiar el estado de tareas',
      code: 'FORBIDDEN',
    };
  }

  const { user, organization } = context;

  // 3. Instanciar repositorio y ejecutar caso de uso
  const supabase = await createServerSupabaseClient();
  const taskRepository = new SupabaseTaskRepository(supabase);

  const result = await updateTaskStatus(
    {
      taskId: parsed.data.taskId as TaskId,
      status: parsed.data.status,
      organizationId: organization.id as OrganizationId,
      actorUserId: user.id,
    },
    { taskRepository, logger: consoleLogger },
  );

  // 4. Mapear errores sin exponer detalles técnicos
  if (!result.success) {
    const { code, message } = result.error;
    if (code === 'NOT_FOUND') {
      return { ok: false, error: 'Tarea no encontrada', code: 'NOT_FOUND' };
    }
    if (code === 'CONFLICT') {
      return { ok: false, error: message, code: 'CONFLICT' };
    }
    if (code === 'FORBIDDEN') {
      return { ok: false, error: 'Sin permisos para modificar esta tarea', code: 'FORBIDDEN' };
    }
    return { ok: false, error: 'Error interno al actualizar la tarea', code: 'INTERNAL_ERROR' };
  }

  // 5. Revalidar solo en éxito
  revalidatePath('/tasks');
  revalidatePath('/dashboard');

  return { ok: true };
}
