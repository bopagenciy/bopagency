/**
 * SupabaseAutomationRepository
 *
 * Implementación de AutomationRepository respaldada por Supabase.
 *
 * SEGURIDAD:
 * - Todas las operaciones filtran por organization_id (multi-tenant).
 * - Nunca se ejecuta .eq('id', id) sin .eq('organization_id', organizationId).
 * - No se usa service_role desde esta capa.
 * - RLS activo en la tabla; esta capa agrega filtros explícitos como defensa en profundidad.
 *
 * COMPATIBILIDAD LEGACY:
 * - La tabla automations tiene columnas legacy (legacy_id, schedule, provider, etc.)
 *   que no forman parte del dominio Phase 6A. Se ignoran en las queries de dominio.
 * - El mapper transitorio maneja 'inactive' → 'paused'.
 *
 * ERRORES:
 * - Supabase errors → Result<T, DomainError> con códigos NOT_FOUND / CONFLICT / INTERNAL_ERROR.
 * - PGRST116 = no rows returned → NOT_FOUND.
 * - 23505 (unique violation) → CONFLICT.
 */

import { ok, err } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  Automation,
  AutomationId,
  AutomationStatus,
  CreateAutomationInput,
  AutomationFilter,
} from '@bop-agency/domain';
import type { ClientId, OrganizationId } from '@bop-agency/domain';
import type {
  AutomationRepository,
  AutomationCountByStatus,
  UpdateAutomationInput,
} from '@bop-agency/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rowToAutomation, type AutomationRow } from '../mappers/automation.mapper';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 20;
const TABLE = 'automations' as const;

// ─── Repository ───────────────────────────────────────────────────────────────

export class SupabaseAutomationRepository implements AutomationRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // ── create ────────────────────────────────────────────────────────────────────

  async create(input: CreateAutomationInput): Promise<Result<Automation>> {
    const {
      organizationId,
      clientId,
      name,
      description,
      triggerConfig,
      retryPolicy,
      n8nWorkflowId,
      metadata,
    } = input;

    const { data, error } = await this.supabase
      .from(TABLE)
      .insert({
        organization_id:  organizationId,
        client_id:        clientId ?? null,
        name:             name.trim(),
        description:      description ?? null,
        status:           'draft' as AutomationStatus,
        trigger_config:   triggerConfig ?? { type: 'manual' },
        retry_policy:     retryPolicy ?? {
          maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000,
        },
        n8n_workflow_id:  n8nWorkflowId ?? null,
        metadata:         metadata ?? {},
        // Campos legacy requeridos por la tabla (Phase 4 constraints)
        legacy_id:        `domain-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        schedule:         {},
      })
      .select('*')
      .single();

    if (error || !data) {
      if (error?.code === '23505') {
        return err({
          code: 'CONFLICT' as const,
          message: `Ya existe una automatización con ese nombre en la organización`,
          details: error.message,
        });
      }
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al crear la automatización',
        details: error?.message,
      });
    }

    try {
      return ok(rowToAutomation(data as unknown as AutomationRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos de la automatización creada',
        details: mappingError,
      });
    }
  }

  // ── update ────────────────────────────────────────────────────────────────────

  async update(
    id: AutomationId,
    organizationId: OrganizationId,
    data: UpdateAutomationInput,
  ): Promise<Result<Automation>> {
    const patch: Record<string, unknown> = {};

    if (data.name !== undefined)          patch['name']            = data.name.trim();
    if (data.description !== undefined)   patch['description']     = data.description;
    if (data.status !== undefined)        patch['status']          = data.status;
    if (data.n8nWorkflowId !== undefined) patch['n8n_workflow_id'] = data.n8nWorkflowId;
    if (data.metadata !== undefined)      patch['metadata']        = data.metadata;

    if (Object.keys(patch).length === 0) {
      // Nada que actualizar — fetch y retornar
      return this.findById(id, organizationId);
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
          message: `Automatización ${id} no encontrada en la organización`,
        });
      }
      if (error?.code === '23505') {
        return err({
          code: 'CONFLICT' as const,
          message: `Ya existe una automatización con ese nombre en la organización`,
        });
      }
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al actualizar la automatización',
        details: error?.message,
      });
    }

    try {
      return ok(rowToAutomation(row as unknown as AutomationRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos de la automatización actualizada',
        details: mappingError,
      });
    }
  }

  // ── archive ───────────────────────────────────────────────────────────────────

  async archive(id: AutomationId, organizationId: OrganizationId): Promise<Result<void>> {
    const { data: row, error } = await this.supabase
      .from(TABLE)
      .update({ status: 'archived' })
      .eq('id', id)
      .eq('organization_id', organizationId)  // ← aislamiento multi-tenant obligatorio
      .select('id, status')
      .single();

    if (error || !row) {
      if (error?.code === 'PGRST116' || !row) {
        return err({
          code: 'NOT_FOUND' as const,
          message: `Automatización ${id} no encontrada en la organización`,
        });
      }
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al archivar la automatización',
        details: (error as { message?: string } | null)?.message,
      });
    }

    // Idempotente: si ya estaba archivada, retornamos ok
    return ok(undefined);
  }

  // ── findById ──────────────────────────────────────────────────────────────────

  async findById(id: AutomationId, organizationId: OrganizationId): Promise<Result<Automation>> {
    const { data, error } = await this.supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)  // ← aislamiento multi-tenant obligatorio
      .single();

    if (error || !data) {
      return err({
        code: 'NOT_FOUND' as const,
        message: `Automatización ${id} no encontrada en la organización`,
      });
    }

    try {
      return ok(rowToAutomation(data as unknown as AutomationRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos de la automatización',
        details: mappingError,
      });
    }
  }

  // ── findByOrganization ────────────────────────────────────────────────────────

  async findByOrganization(
    filter: AutomationFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Automation>> {
    const page     = pagination.page     ?? 1;
    const pageSize = pagination.pageSize ?? DEFAULT_PAGE_SIZE;
    const from     = (page - 1) * pageSize;
    const to       = from + pageSize - 1;

    let query = this.supabase
      .from(TABLE)
      .select('*', { count: 'exact' })
      .eq('organization_id', filter.organizationId);

    if (filter.status !== undefined) {
      query = query.eq('status', filter.status);
    }
    if (filter.clientId !== undefined) {
      query = query.eq('client_id', filter.clientId);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return emptyPaginatedResult(page, pageSize);
    }

    const total      = count ?? 0;
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
    const items      = mapSafe(data ?? [], (row) => rowToAutomation(row as unknown as AutomationRow));

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

  // ── findByClient ──────────────────────────────────────────────────────────────

  async findByClient(
    clientId: ClientId,
    organizationId: OrganizationId,
    filters: { status?: AutomationStatus },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Automation>> {
    return this.findByOrganization(
      {
        organizationId,
        clientId,
        ...(filters.status !== undefined && { status: filters.status }),
      },
      pagination,
    );
  }

  // ── existsByName ──────────────────────────────────────────────────────────────

  async existsByName(
    name: string,
    organizationId: OrganizationId,
    excludeId?: AutomationId,
  ): Promise<Result<boolean>> {
    let query = this.supabase
      .from(TABLE)
      .select('id')
      .eq('organization_id', organizationId)
      .eq('name', name.trim());

    if (excludeId !== undefined) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query.limit(1);

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al verificar unicidad del nombre',
        details: error.message,
      });
    }

    return ok(Array.isArray(data) && data.length > 0);
  }

  // ── countByStatus ─────────────────────────────────────────────────────────────

  async countByStatus(organizationId: OrganizationId): Promise<Result<AutomationCountByStatus>> {
    const { data, error } = await this.supabase
      .from(TABLE)
      .select('status')
      .eq('organization_id', organizationId);

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al contar automatizaciones por status',
        details: error.message,
      });
    }

    const mutable: Record<AutomationStatus, number> = {
      draft:    0,
      active:   0,
      paused:   0,
      archived: 0,
    };

    for (const row of data ?? []) {
      const raw = (row as { status: string }).status;
      // Aplicar la misma lógica transitoria: inactive → paused
      const status = raw === 'inactive' ? 'paused' : raw;
      if (status in mutable) {
        mutable[status as AutomationStatus]++;
      }
      // 'error' y 'disabled' se ignoran en el conteo (no son estados de dominio)
    }

    return ok(mutable);
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
