/**
 * Task — entidad de dominio para la tabla `tasks` en Supabase.
 *
 * IMPORTANTE — cambios respecto a la entidad anterior:
 * - `TaskStatus` ahora usa los valores reales del enum DB:
 *   'pending' | 'in_progress' | 'done' | 'cancelled' | 'blocked'
 *   (anteriormente incluía 'completed' y 'on_hold')
 * - Añadidos: organizationId, tags, deletedAt, createdBy, updatedBy.
 * - Eliminado: requiresApproval (no existe en tabla DB).
 * - Eliminado: assigneeId (columna assignee_id no existe en tabla DB).
 * - La tabla sí tiene `created_by` y `updated_by` (user IDs como strings).
 * - Transiciones de estado implementadas como funciones puras de dominio.
 */

import type { ClientId } from './client';
import type { OrganizationId } from './organization';
import type { TaskStatus } from '@bop-agency/shared';

export type TaskId = string & { readonly _brand: 'TaskId' };

// ─── TaskPriority — coincide con el enum DB task_priority ────────────────────

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// ─── Task entity ──────────────────────────────────────────────────────────────

export type Task = {
  readonly id: TaskId;
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId | null;
  readonly title: string;
  readonly description: string | null;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly dueDate: Date | null;
  readonly tags: string[];
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /**
   * Soft-delete: si está definido, la tarea está eliminada.
   * Las queries siempre deben filtrar `deleted_at IS NULL` salvo que
   * se solicite explícitamente incluir eliminadas.
   */
  readonly deletedAt: Date | null;
};

// ─── Task filter ──────────────────────────────────────────────────────────────

export type TaskFilter = {
  readonly organizationId: OrganizationId;
  readonly clientId?: ClientId;
  readonly status?: TaskStatus;
  readonly overdue?: boolean;
  readonly includeDeleted?: boolean;
};

// ─── Transition rules ─────────────────────────────────────────────────────────

/**
 * Grafo de transiciones válidas de TaskStatus.
 *
 * pending    → in_progress, cancelled
 * in_progress → done, cancelled, blocked
 * blocked    → in_progress, cancelled
 * done       → (ninguna — estado final)
 * cancelled  → (ninguna — estado final)
 *
 * Nota: el dominio no restringe "done → pending" porque podría haber casos
 * de negocio legítimos. Si se quiere reapertura explícita, se puede añadir
 * una transición done → pending aquí.
 */
const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['done', 'cancelled', 'blocked'],
  blocked: ['in_progress', 'cancelled'],
  done: [], // estado final
  cancelled: [], // estado final
};

/**
 * Retorna `true` si la transición de `from` a `to` es válida.
 */
export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

/**
 * Retorna los estados válidos a los que puede transicionar una tarea
 * desde su estado actual.
 */
export function getTaskNextStates(status: TaskStatus): TaskStatus[] {
  return [...TASK_TRANSITIONS[status]];
}

// ─── Domain rules ─────────────────────────────────────────────────────────────

/**
 * Retorna `true` si la tarea está vencida.
 * Una tarea está vencida si su dueDate ya pasó y su estado NO es final.
 */
export function isTaskOverdue(task: Task, now: Date = new Date()): boolean {
  if (!task.dueDate) return false;
  if (task.status === 'done' || task.status === 'cancelled') return false;
  return task.dueDate < now;
}
