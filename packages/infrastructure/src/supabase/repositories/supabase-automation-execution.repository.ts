/**
 * SupabaseAutomationExecutionRepository
 *
 * Implementación de AutomationExecutionRepository respaldada por Supabase.
 *
 * SEGURIDAD:
 * - Todas las operaciones filtran por organization_id (multi-tenant).
 * - Nunca se ejecuta .eq('id', id) sin .eq('organization_id', organizationId).
 * - No se usa service_role desde esta capa.
 * - idempotency_key es UNIQUE por (organization_id, key) — no global.
 * - error_message sanitizado por el mapper antes de devolver al consumidor.
 * - No se almacenan secretos en input_metadata / output_metadata.
 *
 * ERRORES:
 * - 23505 (unique violation en idempotency_key) → CONFLICT con mensaje semántico.
 * - PGRST116 (no rows) → NOT_FOUND.
 * - Otros errores Supabase → INTERNAL_ERROR.
 */

import { ok, err } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  AutomationExecution,
  AutomationExecutionId,
  AutomationExecutionFilter,
  AutomationExecutionStatus,
  IdempotencyKey,
} from '@bop-agency/domain';
import type { AutomationId, OrganizationId } from '@bop-agency/domain';
import type {
  AutomationExecutionRepository,
  AutomationExecutionCountByStatus,
  CreateExecutionInput,
  UpdateExecutionStatusInput,
} from '@bop-agency/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  rowToAutomationExecution,
  type AutomationExecutionRow,
} from '../mappers/automation-execution.mapper';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 20;
const TABLE = 'automation_executions' as const;

// ─── Repository ───────────────────────────────────────────────────────────────

export class SupabaseAutomationExecutionRepository implements AutomationExecutionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // ── create ────────────────────────────────────────────────────────────────────

  async create(input: CreateExecutionInput): Promise<Result<AutomationExecution>> {
    const {
      organizationId,
      automationId,
      clientId,
      idempotencyKey,
      triggeredBy,
      triggerType,
      attempt,
      inputMetadata,
    } = input;

    const now = new Date().toISOString();

    const { data, error } = await this.supabase
      .from(TABLE)
      .insert({
        organization_id:  organizationId,
        automation_id:    automationId,
        client_id:        clientId ?? null,
        status:           'queued',
        attempt:          attempt,
        idempotency_key:  idempotencyKey,
        triggered_by:     triggeredBy,
        trigger_type:     triggerType,
        input_metadata:   inputMetadata ?? null,
        output_metadata:  null,
        error_code:       null,
        error_message:    null,
        queued_at:        now,
      })
      .select('*')
      .single();

    if (error || !data) {
      // 23505 = unique_violation → idempotency_key duplicado en la misma organización
      if (error?.code === '23505') {
        return err({
          code: 'CONFLICT' as const,
          message: `Ya existe una ejecución con la clave de idempotencia "${idempotencyKey}" ` +
                   `en la organización. La operación es idempotente; no se creó un duplicado.`,
          details: error.message,
        });
      }
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al crear la ejecución de automatización',
        details: error?.message,
      });
    }

    try {
      return ok(rowToAutomationExecution(data as unknown as AutomationExecutionRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos de la ejecución creada',
        details: mappingError,
      });
    }
  }

  // ── updateStatus ──────────────────────────────────────────────────────────────

  async updateStatus(
    id: AutomationExecutionId,
    organizationId: OrganizationId,
    data: UpdateExecutionStatusInput,
  ): Promise<Result<AutomationExecution>> {
    const patch: Record<string, unknown> = {
      status: data.status,
    };

    if (data.startedAt   !== undefined) patch['started_at']    = data.startedAt?.toISOString() ?? null;
    if (data.completedAt !== undefined) patch['completed_at']  = data.completedAt?.toISOString() ?? null;
    if (data.outputMetadata !== undefined) patch['output_metadata'] = data.outputMetadata;
    if (data.errorCode   !== undefined) patch['error_code']    = data.errorCode;
    if (data.errorMessage !== undefined) {
      // Sanitizar antes de persistir
      const msg = data.errorMessage;
      patch['error_message'] = msg ? msg.slice(0, 500) : null;
    }

    const { data: row, error } = await this.supabase
      .from(TABLE)
      .update(patch)
      .eq('id', id)
      .eq('organization_id', organizationId)  // ← aislamiento multi-tenant obligatorio
      .select('*')
      .single();

    if (error || !row) {
      if (error?.code === 'PGRST116' || !row) {
        return err({
          code: 'NOT_FOUND' as const,
          message: `Ejecución ${id} no encontrada en la organización`,
        });
      }
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al actualizar el estado de la ejecución',
        details: error?.message,
      });
    }

    try {
      return ok(rowToAutomationExecution(row as unknown as AutomationExecutionRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos de la ejecución actualizada',
        details: mappingError,
      });
    }
  }

  // ── findById ──────────────────────────────────────────────────────────────────

  async findById(
    id: AutomationExecutionId,
    organizationId: OrganizationId,
  ): Promise<Result<AutomationExecution>> {
    const { data, error } = await this.supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)  // ← aislamiento multi-tenant obligatorio
      .single();

    if (error || !data) {
      return err({
        code: 'NOT_FOUND' as const,
        message: `Ejecución ${id} no encontrada en la organización`,
      });
    }

    try {
      return ok(rowToAutomationExecution(data as unknown as AutomationExecutionRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos de la ejecución',
        details: mappingError,
      });
    }
  }

  // ── findByIdempotencyKey ──────────────────────────────────────────────────────

  async findByIdempotencyKey(
    key: IdempotencyKey,
    organizationId: OrganizationId,
  ): Promise<Result<AutomationExecution | null>> {
    const { data, error } = await this.supabase
      .from(TABLE)
      .select('*')
      .eq('organization_id', organizationId)  // ← scoped por tenant, no global
      .eq('idempotency_key', key)
      .single();

    // PGRST116 = no rows → retornar null (no encontrado no es error para idempotencia)
    if (error?.code === 'PGRST116') {
      return ok(null);
    }

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al buscar ejecución por clave de idempotencia',
        details: error.message,
      });
    }

    if (!data) {
      return ok(null);
    }

    try {
      return ok(rowToAutomationExecution(data as unknown as AutomationExecutionRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos de la ejecución encontrada',
        details: mappingError,
      });
    }
  }

  // ── findByAutomation ──────────────────────────────────────────────────────────

  async findByAutomation(
    automationId: AutomationId,
    organizationId: OrganizationId,
    filters: { status?: AutomationExecutionStatus },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<AutomationExecution>> {
    return this.findByOrganization(
      {
        organizationId,
        automationId,
        ...(filters.status !== undefined && { status: filters.status }),
      },
      pagination,
    );
  }

  // ── findByOrganization ────────────────────────────────────────────────────────

  async findByOrganization(
    filter: AutomationExecutionFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<AutomationExecution>> {
    const page     = pagination.page     ?? 1;
    const pageSize = pagination.pageSize ?? DEFAULT_PAGE_SIZE;
    const from     = (page - 1) * pageSize;
    const to       = from + pageSize - 1;

    let query = this.supabase
      .from(TABLE)
      .select('*', { count: 'exact' })
      .eq('organization_id', filter.organizationId);

    if (filter.automationId !== undefined) {
      query = query.eq('automation_id', filter.automationId);
    }
    if (filter.clientId !== undefined) {
      query = query.eq('client_id', filter.clientId);
    }
    if (filter.status !== undefined) {
      query = query.eq('status', filter.status);
    }

    const { data, error, count } = await query
      .order('queued_at', { ascending: false })
      .range(from, to);

    if (error) {
      return emptyPaginatedResult(page, pageSize);
    }

    const total      = count ?? 0;
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
    const items      = mapSafe(
      data ?? [],
      (row) => rowToAutomationExecution(row as unknown as AutomationExecutionRow),
    );

    return {
      data:            items,
      total,
      page,
      pageSize,
      totalPages,
      hasNextPage:     page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  // ── countByStatus ─────────────────────────────────────────────────────────────

  async countByStatus(
    organizationId: OrganizationId,
    automationId?: AutomationId,
  ): Promise<Result<AutomationExecutionCountByStatus>> {
    let query = this.supabase
      .from(TABLE)
      .select('status')
      .eq('organization_id', organizationId);

    if (automationId !== undefined) {
      query = query.eq('automation_id', automationId);
    }

    const { data, error } = await query;

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al contar ejecuciones por status',
        details: error.message,
      });
    }

    const mutable: Record<AutomationExecutionStatus, number> = {
      queued:    0,
      running:   0,
      succeeded: 0,
      failed:    0,
      cancelled: 0,
      retrying:  0,
    };

    for (const row of data ?? []) {
      const status = (row as { status: string }).status as AutomationExecutionStatus;
      if (status in mutable) {
        mutable[status]++;
      }
    }

    return ok(mutable);
  }
  // ── Phase 6F: listStuckCandidates ─────────────────────────────────────────────
  //
  // Devuelve ejecuciones en estado queued/running cuya fecha de inicio o encolado
  // sea anterior a `olderThan`. Usado por EvaluateStuckAutomationExecutionsUseCase.

  async listStuckCandidates(
    organizationId: OrganizationId,
    statuses: ('queued' | 'running')[],
    olderThan: Date,
    pageSize: number,
    page: number = 1,
  ): Promise<PaginatedResult<AutomationExecution>> {
    const from = (page - 1) * pageSize;
    const to   = from + pageSize - 1;

    let query = this.supabase
      .from('automation_executions')
      .select('*', { count: 'exact' })
      .eq('organization_id', String(organizationId))
      .in('status', statuses);

    // Para queued: queuedAt < olderThan
    // Para running: startedAt < olderThan (fallback a queuedAt)
    // Supabase no soporta OR condicional por fila fácilmente, usamos queued_at
    // como proxy seguro (siempre está definido)
    query = query.lt('queued_at', olderThan.toISOString());

    const { data, error, count } = await query
      .order('queued_at', { ascending: true })
      .range(from, to);

    if (error) {
      return emptyPaginatedResult(page, pageSize);
    }

    const total = count ?? 0;
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
    const items = mapSafe(data ?? [], (row) =>
      rowToAutomationExecution(row as unknown as AutomationExecutionRow),
    );

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

}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyPaginatedResult<T>(page: number, pageSize: number): PaginatedResult<T> {
  return {
    data:            [],
    total:           0,
    page,
    pageSize,
    totalPages:      0,
    hasNextPage:     false,
    hasPreviousPage: false,
  };
}

function mapSafe<T>(rows: unknown[], mapper: (row: unknown) => T): T[] {
  const results: T[] = [];
  for (const row of rows) {
    try {
      results.push(mapper(row));
    } catch {
      // Fila con datos inválidos descartada silenciosamente
    }
  }
  return results;
}
