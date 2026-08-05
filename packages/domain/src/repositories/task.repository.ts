/**
 * TaskRepository — contrato de dominio para la tabla `tasks`.
 *
 * Phase 5A: métodos de lectura + countByStatus.
 * Phase 5B: updateStatus.
 * Phase 6F: create, findActiveBySignatureTag (para deduplicación de tareas automáticas).
 */

import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Task, TaskFilter, TaskId, TaskPriority } from '../entities/task';
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

// ─── Phase 6F: input types ────────────────────────────────────────────────────

export type CreateTaskInput = {
  readonly organizationId: OrganizationId;
  readonly clientId?: string | null;
  readonly title: string;
  readonly description?: string | null;
  readonly priority?: TaskPriority;
  readonly tags?: string[];
  readonly dueDate?: Date | null;
  readonly createdBy?: string | null;
};

// ─── Repository interface ─────────────────────────────────────────────────────

export interface TaskRepository {
  findById(id: TaskId, organizationId: OrganizationId): Promise<Result<Task>>;

  /**
   * Lista tareas de la organización con filtros opcionales.
   * Por defecto excluye tareas con deleted_at (soft-deleted).
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
   */
  findUpcoming(organizationId: OrganizationId, days: number): Promise<Result<Task[]>>;

  /**
   * Cuenta tareas agrupadas por status. Excluye soft-deleted.
   */
  countByStatus(organizationId: OrganizationId): Promise<Result<TaskCountByStatus>>;

  /**
   * Actualiza el status de una tarea.
   */
  updateStatus(
    id: TaskId,
    status: TaskStatus,
    organizationId: OrganizationId,
    updatedBy: string,
  ): Promise<Result<Task>>;

  // ── Phase 6F: Automation task management ─────────────────────────────────────

  /**
   * Crea una nueva tarea operativa.
   * Usado por el evaluador de incidentes de automatización.
   * No valida transiciones (la tarea comienza en 'pending').
   */
  create(input: CreateTaskInput): Promise<Result<Task>>;

  /**
   * Busca tareas activas (pending/in_progress/blocked) que contengan
   * el tag de firma dado. Usado para deduplicación de tareas automáticas.
   * Retorna array vacío si no hay coincidencias (no error).
   */
  findActiveBySignatureTag(
    signatureTag: string,
    organizationId: OrganizationId,
  ): Promise<Result<Task[]>>;
}
