/**
 * SupabaseCampaignRepository
 *
 * Implementación de CampaignRepository respaldada por Supabase — Phase 7B.
 * Todas las operaciones filtran por organization_id (multi-tenant).
 * Usa el cliente del usuario con RLS activo — nunca service_role en esta capa.
 *
 * Operaciones implementadas en Phase 7B: findById, findAll, create, update.
 * NO implementadas todavía (Phase 7C): approveCampaign, rejectCampaign
 * (se espera que usen una RPC dedicada, no este repositorio — ver la nota de
 * RLS en la migración). NO hay createCampaignWithAI (Phase 7D).
 */

import { ok, err } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  Campaign,
  CampaignId,
  CampaignFilter,
  CampaignRepository,
  CreateCampaignInput,
  UpdateCampaignInput,
} from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rowToCampaign, type CampaignRow } from '../mappers/campaign.mapper';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 20;

// ─── Repository ───────────────────────────────────────────────────────────────

export class SupabaseCampaignRepository implements CampaignRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // ── findById ─────────────────────────────────────────────────────────────────

  async findById(id: CampaignId, organizationId: OrganizationId): Promise<Result<Campaign>> {
    const { data, error } = await this.supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) {
      return err({
        code: 'NOT_FOUND' as const,
        message: `Campaña ${id} no encontrada en la organización`,
      });
    }

    try {
      return ok(rowToCampaign(data as unknown as CampaignRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos de la campaña',
        details: mappingError,
      });
    }
  }

  // ── findAll ────────────────────────────────────────────────────────────────────

  async findAll(
    filter: CampaignFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Campaign>> {
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .from('campaigns')
      .select('*', { count: 'exact' })
      .eq('organization_id', filter.organizationId);

    if (filter.clientId !== undefined) {
      query = query.eq('client_id', filter.clientId);
    }
    if (filter.status !== undefined) {
      query = query.eq('status', filter.status);
    }
    if (filter.platform !== undefined) {
      query = query.eq('platform', filter.platform);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return emptyPaginatedResult(page, pageSize);
    }

    const total = count ?? 0;
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
    const items = mapSafe(data ?? [], (row) => rowToCampaign(row as unknown as CampaignRow));

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

  // ── create ─────────────────────────────────────────────────────────────────────

  /**
   * Crea una campaña en estado 'draft'. created_by/updated_by los asigna el
   * trigger manage_campaign_write desde auth.uid() en BD — se envían aquí
   * también por completitud del Insert, pero la BD es la fuente de verdad
   * (el trigger sobrescribe si auth.uid() está presente).
   */
  async create(data: CreateCampaignInput): Promise<Result<Campaign>> {
    const now = new Date().toISOString();

    const { data: row, error } = await this.supabase
      .from('campaigns')
      .insert({
        organization_id: String(data.organizationId),
        client_id: String(data.clientId),
        name: data.name,
        platform: data.platform,
        objective: data.objective,
        status: 'draft',
        brief: data.brief ?? null,
        budget: data.budget,
        currency: data.currency ?? 'COP',
        start_date: data.startDate ? toDateOnly(data.startDate) : null,
        end_date: data.endDate ? toDateOnly(data.endDate) : null,
        metadata: data.metadata ?? {},
        created_by: data.createdBy,
        updated_by: data.createdBy,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    if (error || !row) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al crear la campaña',
        details: error?.message ?? error?.code,
      });
    }

    try {
      return ok(rowToCampaign(row as unknown as CampaignRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos de la campaña creada',
        details: mappingError,
      });
    }
  }

  // ── update ─────────────────────────────────────────────────────────────────────

  /**
   * Actualiza una campaña. No valida transiciones aquí — responsabilidad del
   * application layer (canTransitionCampaign). RLS ya impide que este UPDATE
   * afecte campañas fuera de 'draft', o fije status fuera de
   * ('draft','review') — ver campaigns_update policy en la migración.
   */
  async update(
    id: CampaignId,
    organizationId: OrganizationId,
    data: UpdateCampaignInput,
  ): Promise<Result<Campaign>> {
    const patch: Record<string, unknown> = {
      updated_by: data.updatedBy,
      updated_at: new Date().toISOString(),
    };
    if (data.name !== undefined) patch.name = data.name;
    if (data.platform !== undefined) patch.platform = data.platform;
    if (data.objective !== undefined) patch.objective = data.objective;
    if (data.brief !== undefined) patch.brief = data.brief;
    if (data.budget !== undefined) patch.budget = data.budget;
    if (data.currency !== undefined) patch.currency = data.currency;
    if (data.startDate !== undefined) {
      patch.start_date = data.startDate ? toDateOnly(data.startDate) : null;
    }
    if (data.endDate !== undefined) {
      patch.end_date = data.endDate ? toDateOnly(data.endDate) : null;
    }
    if (data.metadata !== undefined) patch.metadata = data.metadata;
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === 'review') {
        patch.submitted_for_review_at = new Date().toISOString();
      }
    }

    const { data: row, error } = await this.supabase
      .from('campaigns')
      .update(patch)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select('*')
      .single();

    if (error || !row) {
      if (error?.code === 'PGRST116') {
        return err({
          code: 'NOT_FOUND' as const,
          message: `Campaña ${id} no encontrada en la organización`,
        });
      }
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: error?.message ?? 'Error al actualizar la campaña',
      });
    }

    try {
      return ok(rowToCampaign(row as unknown as CampaignRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos de la campaña actualizada',
        details: mappingError,
      });
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

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
