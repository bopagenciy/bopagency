/**
 * SupabaseTaskRepository
 *
 * Implementación de TaskRepository respaldada por Supabase.
 * Todas las operaciones filtran por organization_id (multi-tenant).
 * Las queries de lectura excluyen deleted_at IS NOT NULL por defecto.
 * Usa el cliente del usuario con RLS activo — nunca service_role en esta capa.
 *
 * OVERDUE (tareas vencidas):
 * Una tarea está vencida si `due_date < now()` y su estado NO es final
 * (done / cancelled). Se filtra directamente en la query con `.lt('due_date', now)`.
 * La fecha `now` se recibe como parámetro inyectable para facilitar tests.
 *
 * findUpcoming:
 * Tareas no finalizadas con `due_date` entre now y now+days días.
 * Ordena por due_date ASC. Excluye tareas sin due_date.
 *
 * countByStatus:
 * Selecciona solo `status` y agrega en TypeScript. Excluye soft-deleted.
 * Candidato a RPC si el volumen de tareas escala.
 */

import { ok, err } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { TaskStatus } from '@bop-agency/shared';
import type {
  Task,
  TaskFilter,
  TaskId,
  TaskRepository,
  TaskCountByStatus,
  CreateTaskInput,
} from '@bop-agency/domain';
import type { ClientId, OrganizationId } from '@bop-agency/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rowToTask, type TaskRow } from '../mappers/task.mapper';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 20;

/** Estados no finales que pueden ser overdue. */
const ACTIVE_TASK_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'blocked'];

/** Estados finales — no pueden estar overdue. */
const FINAL_TASK_STATUSES: TaskStatus[] = ['done', 'cancelled'];

// ─── Repository ───────────────────────────────────────────────────────────────

export class SupabaseTaskRepository implements TaskRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // ── findById ─────────────────────────────────────────────────────────────────

  async findById(id: TaskId, organizationId: OrganizationId): Promise<Result<Task>> {
    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) {
      return err({
        code: 'NOT_FOUND' as const,
        message: `Tarea ${id} no encontrada en la organización`,
      });
    }

    try {
      return ok(rowToTask(data as unknown as TaskRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos de la tarea',
        details: mappingError,
      });
    }
  }

  // ── findByOrganization ────────────────────────────────────────────────────────

  async findByOrganization(
    filter: TaskFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Task>> {
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .from('tasks')
      .select('*', { count: 'exact' })
      .eq('organization_id', filter.organizationId);

    // Soft-delete: excluir por defecto
    if (!filter.includeDeleted) {
      query = query.is('deleted_at', null);
    }

    if (filter.status !== undefined) {
      query = query.eq('status', filter.status);
    }

    if (filter.clientId !== undefined) {
      query = query.eq('client_id', filter.clientId);
    }

    if (filter.overdue === true) {
      // Tareas vencidas: due_date en el pasado y estado no final
      const now = new Date().toISOString();
      query = query
        .lt('due_date', now)
        .not('due_date', 'is', null)
        .in('status', ACTIVE_TASK_STATUSES);
    }

    const { data, error, count } = await query
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return emptyPaginatedResult(page, pageSize);
    }

    const total = count ?? 0;
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
    const items = mapSafe(data ?? [], (row) => rowToTask(row as unknown as TaskRow));

    return {
      data: items,
      total,
      page,
      pageSize,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  // ── findByClient ──────────────────────────────────────────────────────────────

  async findByClient(
    clientId: ClientId,
    organizationId: OrganizationId,
    filters: { status?: TaskStatus; includeDeleted?: boolean },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Task>> {
    return this.findByOrganization(
      {
        organizationId,
        clientId,
        ...(filters.status !== undefined && { status: filters.status }),
        includeDeleted: filters.includeDeleted ?? false,
      },
      pagination,
    );
  }

  // ── findUpcoming ──────────────────────────────────────────────────────────────

  /**
   * Tareas próximas a vencer en los próximos `days` días.
   *
   * - Excluye tareas en estado final (done, cancelled).
   * - Excluye tareas soft-deleted.
   * - Excluye tareas sin due_date (no tienen fecha de vencimiento).
   * - Incluye tareas ya vencidas (due_date < now) si siguen activas.
   * - Ordena por due_date ASC (las más urgentes primero).
   */
  async findUpcoming(organizationId: OrganizationId, days: number): Promise<Result<Task[]>> {
    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .not('due_date', 'is', null)
      .not('status', 'in', `(${FINAL_TASK_STATUSES.map((s) => `"${s}"`).join(',')})`)
      .lte('due_date', future.toISOString())
      .order('due_date', { ascending: true });

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al obtener tareas próximas',
        details: error.message,
      });
    }

    const tasks = mapSafe(data ?? [], (row) => rowToTask(row as unknown as TaskRow));
    return ok(tasks);
  }

  // ── countByStatus ─────────────────────────────────────────────────────────────

  /**
   * Cuenta tareas por estado. Excluye soft-deleted.
   *
   * Selecciona solo la columna `status` para minimizar transferencia de datos.
   * Se agrega en TypeScript. Candidato a RPC si el volumen de tareas escala.
   */
  async countByStatus(organizationId: OrganizationId): Promise<Result<TaskCountByStatus>> {
    const { data, error } = await this.supabase
      .from('tasks')
      .select('status')
      .eq('organization_id', organizationId)
      .is('deleted_at', null);

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al contar tareas por estado',
        details: error.message,
      });
    }

    const mutable = {
      pending: 0,
      in_progress: 0,
      done: 0,
      cancelled: 0,
      blocked: 0,
    };

    for (const row of data ?? []) {
      const status = row.status as TaskStatus;
      if (status in mutable) {
        mutable[status]++;
      }
    }

    return ok(mutable);
  }

  // ── updateStatus ──────────────────────────────────────────────────────────────

  /**
   * Actualiza el estado de una tarea.
   *
   * Verifica que la tarea pertenezca a la organización antes de actualizar.
   * No valida transiciones de estado aquí — esa validación es responsabilidad
   * del application layer (use case `updateTaskStatus`).
   */
  async updateStatus(
    id: TaskId,
    status: TaskStatus,
    organizationId: OrganizationId,
    updatedBy: string,
  ): Promise<Result<Task>> {
    const { data, error } = await this.supabase
      .from('tasks')
      .update({
        status,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error || !data) {
      if (error?.code === 'PGRST116') {
        return err({
          code: 'NOT_FOUND' as const,
          message: `Tarea ${id} no encontrada en la organización`,
        });
      }
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: error?.message ?? 'Error al actualizar el estado de la tarea',
      });
    }

    try {
      return ok(rowToTask(data as unknown as TaskRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos de la tarea actualizada',
        details: mappingError,
      });
    }
  }
  // ── Phase 6F: create ──────────────────────────────────────────────────────────

  async create(input: CreateTaskInput): Promise<Result<Task>> {
    const now = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('tasks')
      .insert({
        organization_id: String(input.organizationId),
        client_id: input.clientId ?? null,
        title: input.title,
        description: input.description ?? null,
        status: 'pending',
        priority: input.priority ?? 'medium',
        tags: input.tags ?? [],
        due_date: input.dueDate ? input.dueDate.toISOString() : null,
        created_by: input.createdBy ?? null,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    if (error || !data) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al crear la tarea operativa',
        details: error?.code,
      });
    }

    try {
      return ok(rowToTask(data as unknown as TaskRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar datos de tarea',
        details: mappingError,
      });
    }
  }

  // ── Phase 6F: findActiveBySignatureTag ────────────────────────────────────────
  //
  // Busca tareas activas (pending/in_progress/blocked) que contengan
  // el tag de firma exacto. Usado para deduplicar tareas automáticas.

  async findActiveBySignatureTag(
    signatureTag: string,
    organizationId: OrganizationId,
  ): Promise<Result<Task[]>> {
    const activeStatuses = ['pending', 'in_progress', 'blocked'];

    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .eq('organization_id', String(organizationId))
      .in('status', activeStatuses)
      .is('deleted_at', null)
      .contains('tags', [signatureTag]);

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al buscar tareas por tag de firma',
        details: error.code,
      });
    }

    const tasks = mapSafe(data ?? [], (row) => rowToTask(row as unknown as TaskRow));
    return ok(tasks);
  }

}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyPaginatedResult<T>(page: number, pageSize: number): PaginatedResult<T> {
  return {
    data: [],
    total: 0,
    page,
    pageSize,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  };
}

function mapSafe<T>(rows: unknown[], mapper: (row: unknown) => T): T[] {
  const results: T[] = [];
  for (const row of rows) {
    try {
      results.push(mapper(row));
    } catch {
      // Fila con datos inválidos descartada
    }
  }
  return results;
}
