/**
 * SupabaseCampaignRepository
 *
 * Implementación de CampaignRepository respaldada por Supabase — Phase 7B
 * (findById/findAll/create/update) + Phase 7C (approve/reject).
 * Todas las operaciones filtran por organization_id (multi-tenant).
 * Usa el cliente del usuario con RLS activo — nunca service_role en esta capa.
 *
 * approve/reject (Phase 7C):
 * OBLIGATORIO usar las RPCs `approve_campaign`/`reject_campaign` — NO UPDATE
 * directo. La policy `campaigns_update` (7B) impide que cualquier UPDATE
 * genérico fije status='approved'/'rejected' (WITH CHECK status IN
 * ('draft','review')); las RPCs son SECURITY DEFINER y son el único camino
 * autorizado para esa transición — ver
 * 20260816140000_phase7c_campaign_approval_workflow.sql. Mismo patrón que
 * `SupabaseAlertRepository.acknowledge`/`resolve`.
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

// ─── RPC helper types (Supabase JS no tipa .rpc() con nuestros Database types
// en esta capa — mismo criterio que SupabaseAlertRepository.acknowledge/resolve) ──

type RpcCapableClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

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

  // ── approve — Phase 7C ────────────────────────────────────────────────────────

  /**
   * Aprueba una campaña en 'review' vía la RPC `approve_campaign`.
   * Verifica primero que la campaña pertenezca a la organización (mismo
   * criterio defensivo que SupabaseAlertRepository.acknowledge/resolve),
   * luego llama a la RPC, y si tiene éxito recarga la campaña actualizada.
   */
  async approve(
    id: CampaignId,
    organizationId: OrganizationId,
    _actorUserId: string,
  ): Promise<Result<Campaign>> {
    const existing = await this.findById(id, organizationId);
    if (!existing.success) return existing;

    const { error } = await (this.supabase as unknown as RpcCapableClient).rpc('approve_campaign', {
      p_campaign_id: id,
    });

    if (error) {
      return err(mapCampaignRpcError(error.message, 'Error al aprobar la campaña'));
    }

    return this.findById(id, organizationId);
  }

  // ── reject — Phase 7C ─────────────────────────────────────────────────────────

  /**
   * Rechaza una campaña en 'review' vía la RPC `reject_campaign`. `note` se
   * envía tal cual — la validación de no-vacía ya ocurrió en capas
   * anteriores (Zod + isValidRejectionNote en el use case); la RPC y el
   * CHECK de BD son la última línea de defensa, no la primera.
   */
  async reject(
    id: CampaignId,
    organizationId: OrganizationId,
    _actorUserId: string,
    note: string,
  ): Promise<Result<Campaign>> {
    const existing = await this.findById(id, organizationId);
    if (!existing.success) return existing;

    const { error } = await (this.supabase as unknown as RpcCapableClient).rpc('reject_campaign', {
      p_campaign_id: id,
      p_note: note,
    });

    if (error) {
      return err(mapCampaignRpcError(error.message, 'Error al rechazar la campaña'));
    }

    return this.findById(id, organizationId);
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

/**
 * Mapea el mensaje de error crudo de las RPCs approve_campaign/reject_campaign
 * a un ErrorCode del proyecto, por coincidencia de substring — mismo criterio
 * que SupabaseAlertRepository.acknowledge/resolve, extendido con CONFLICT
 * (status actual != 'review') y VALIDATION_ERROR (nota de rechazo vacía),
 * que las RPCs de campaigns sí pueden producir y las de alerts no.
 */
function mapCampaignRpcError(
  rawMessage: string | undefined,
  fallbackMessage: string,
): { code: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR'; message: string } {
  const msg = rawMessage ?? fallbackMessage;

  if (msg.includes('not found')) {
    return { code: 'NOT_FOUND', message: msg };
  }
  if (msg.includes('rejection note is required')) {
    return { code: 'VALIDATION_ERROR', message: msg };
  }
  if (msg.includes('lacks admin/owner role') || msg.includes('authentication required')) {
    return { code: 'FORBIDDEN', message: msg };
  }
  if (msg.includes('is not in review')) {
    return { code: 'CONFLICT', message: msg };
  }
  return { code: 'INTERNAL_ERROR', message: msg };
}
