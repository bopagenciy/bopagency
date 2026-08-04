/**
 * updateTaskStatus — Caso de uso para cambiar el estado de una tarea.
 *
 * Flujo:
 * 1. Cargar la tarea actual (verifica org ownership).
 * 2. Verificar que la transición de estado es válida según el dominio.
 * 3. Persistir el nuevo estado via repository.
 *
 * Transiciones válidas (grafo en entities/task.ts):
 *   pending     → in_progress, cancelled
 *   in_progress → done, cancelled, blocked
 *   blocked     → in_progress, cancelled
 *   done        → (ninguna — estado final)
 *   cancelled   → (ninguna — estado final)
 *
 * Responsabilidades del caller (Server Action):
 * - Autenticación del usuario.
 * - Resolución de organizationId desde la sesión del servidor.
 * - Comprobación de rol mínimo (operator).
 * - revalidatePath.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { Task, TaskId, TaskRepository } from '@bop-agency/domain';
import { canTransitionTask } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { TaskStatus } from '@bop-agency/shared';
import type { LoggerPort } from '../../ports/logger.port';

// ─── Input / Deps ─────────────────────────────────────────────────────────────

export type UpdateTaskStatusInput = {
  /**
   * ID de la tarea a actualizar.
   * Viene del payload del cliente, validado con Zod (UUID).
   */
  readonly taskId: TaskId;

  /**
   * Nuevo estado deseado para la tarea.
   */
  readonly status: TaskStatus;

  /**
   * ID de la organización activa.
   * SIEMPRE resuelto en el servidor desde la sesión — nunca del cliente.
   */
  readonly organizationId: OrganizationId;

  /**
   * ID del usuario que realiza la acción.
   * Se persiste en tasks.updated_by para trazabilidad.
   */
  readonly actorUserId: string;
};

export type UpdateTaskStatusDeps = {
  taskRepository: TaskRepository;
  logger: LoggerPort;
};

// ─── Use case ─────────────────────────────────────────────────────────────────

export async function updateTaskStatus(
  input: UpdateTaskStatusInput,
  deps: UpdateTaskStatusDeps,
): Promise<Result<Task>> {
  deps.logger.debug('updateTaskStatus', {
    taskId: input.taskId,
    newStatus: input.status,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  // 1. Cargar la tarea actual (verifica que pertenece a la organización)
  const taskResult = await deps.taskRepository.findById(input.taskId, input.organizationId);
  if (!isOk(taskResult)) {
    return taskResult;
  }

  const task = taskResult.value;

  // Idempotencia: si el estado ya es el deseado, retornar la tarea actual sin error.
  if (task.status === input.status) {
    deps.logger.debug('updateTaskStatus: already in target status', {
      taskId: input.taskId,
      status: input.status,
    });
    return ok(task);
  }

  // 2. Verificar transición de dominio
  if (!canTransitionTask(task.status, input.status)) {
    return err({
      code: 'CONFLICT' as const,
      message: `No se puede cambiar el estado de '${task.status}' a '${input.status}'. Transición no permitida.`,
    });
  }

  // 3. Persistir el nuevo estado
  const result = await deps.taskRepository.updateStatus(
    input.taskId,
    input.status,
    input.organizationId,
    input.actorUserId,
  );

  if (!isOk(result)) {
    deps.logger.error('updateTaskStatus: repository error', { error: result.error });
    return result;
  }

  deps.logger.info('updateTaskStatus: ok', {
    taskId: input.taskId,
    previousStatus: task.status,
    newStatus: input.status,
    actorUserId: input.actorUserId,
  });

  return ok(result.value);
}
