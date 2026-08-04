/**
 * TaskRepository — contrato de dominio para la tabla `tasks`.
 *
 * Phase 5A: métodos de lectura + countByStatus.
 * Mutaciones (`updateStatus`, `create`, `softDelete`) se añaden en Phase 5B.
 */

import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Task, TaskFilter, TaskId } from '../entities/task';
import type { ClientId } from '../entities/client';
import type { OrganizationId } from '../entities/organization';
import type { TaskStatus } from '@bop-agency/shared';

export type TaskCountByStatus = {
  readonly pending: number;
  readonly in_progress: number;
  readonly done: number;
  readonly cancelled: number;
  readonly blocked: number;
};

export interface TaskRepository {
  findById(id: TaskId, organizationId: OrganizationId): Promise<Result<Task>>;

  /**
   * Lista tareas de la organización con filtros opcionales.
   * Por defecto excluye tareas con deleted_at (soft-deleted).
   * Para incluirlas, usar `filter.includeDeleted = true`.
   */
  findByOrganization(
    filter: TaskFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Task>>;

  /**
   * Lista tareas de un cliente específico.
   */
  findByClient(
    clientId: ClientId,
    organizationId: OrganizationId,
    filters: { status?: TaskStatus; includeDeleted?: boolean },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Task>>;

  /**
   * Tareas próximas a vencer en los próximos `days` días.
   * Excluye tareas en estado `done` o `cancelled`.
   */
  findUpcoming(organizationId: OrganizationId, days: number): Promise<Result<Task[]>>;

  /**
   * Cuenta tareas agrupadas por status.
   * Excluye tareas soft-deleted.
   */
  countByStatus(organizationId: OrganizationId): Promise<Result<TaskCountByStatus>>;

  /**
   * Actualiza el status de una tarea.
   * Verifica que la tarea pertenezca a la organización.
   * No valida transiciones — la validación de dominio ocurre en el use case.
   */
  updateStatus(
    id: TaskId,
    status: TaskStatus,
    organizationId: OrganizationId,
    updatedBy: string,
  ): Promise<Result<Task>>;
}
