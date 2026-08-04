import { ok, err } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Task, TaskFilter, TaskRepository } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { TaskStatus } from '@bop-agency/shared';
import type { LoggerPort } from '../../ports/logger.port';

export type ListTasksInput = {
  /** organizationId SIEMPRE viene del servidor (sesión). Nunca del cliente. */
  organizationId: OrganizationId;
  status?: TaskStatus;
  overdue?: boolean;
  pagination: PaginationParams;
};

export type ListTasksDeps = {
  taskRepository: TaskRepository;
  logger: LoggerPort;
};

export async function listTasks(
  input: ListTasksInput,
  deps: ListTasksDeps,
): Promise<Result<PaginatedResult<Task>>> {
  deps.logger.debug('listTasks', {
    organizationId: input.organizationId,
    status: input.status,
    overdue: input.overdue,
  });

  // Construir el filtro sin propiedades undefined (exactOptionalPropertyTypes)
  const filter: TaskFilter = {
    organizationId: input.organizationId,
    includeDeleted: false,
    ...(input.status !== undefined && { status: input.status }),
    ...(input.overdue !== undefined && { overdue: input.overdue }),
  };

  try {
    const result = await deps.taskRepository.findByOrganization(filter, input.pagination);
    return ok(result);
  } catch (e) {
    return err({
      code: 'INTERNAL_ERROR' as const,
      message: 'Error al listar tareas',
      details: e,
    });
  }
}
