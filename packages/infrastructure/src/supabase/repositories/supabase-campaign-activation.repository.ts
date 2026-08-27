/**
 * SupabaseCampaignActivationRepository
 *
 * Implementación de CampaignActivationRepository (aggregate único) respaldada
 * por Supabase — Phase 8A.1. Todas las operaciones filtran por
 * organization_id (multi-tenant). Usa el cliente del usuario con RLS activo —
 * nunca service_role en esta capa.
 *
 * Transiciones críticas (prepareTarget/markTargetReady/markTargetPublished/
 * cancelTarget/cancel) llaman EXCLUSIVAMENTE a las RPCs SECURITY DEFINER de
 * 20260824180000_phase8a1_campaign_activation_domain.sql SECCIÓN F — nunca
 * UPDATE directo (mismo criterio que SupabaseCampaignRepository.approve/
 * reject y SupabaseAlertRepository.acknowledge/resolve). Las RPCs derivan el
 * actor de auth.uid() en BD; el parámetro `actorUserId` de esta clase se
 * mantiene por conformidad con el contrato de dominio pero no se envía a las
 * RPCs (mismo patrón que `_actorUserId` en SupabaseCampaignRepository).
 *
 * `create()` es un INSERT directo (no RPC) — autorizado por RLS + el trigger
 * `check_activation_source` de la migración (revalida campaign.status =
 * 'approved' + que la aprobación referenciada sea real, dentro de la misma
 * transacción). Ver nota de diseño en campaign-activation.repository.ts.
 */

import { ok, err } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  CampaignActivation,
  CampaignActivationId,
  CampaignActivationFilter,
  CreateCampaignActivationInput,
  CampaignActivationRepository,
  CampaignActivationWithTargets,
  CampaignActivationTarget,
  CampaignActivationTargetId,
  CreateActivationTargetInput,
  CampaignActivationEvent,
} from '@bop-agency/domain';
import type { OrganizationId, CampaignId } from '@bop-agency/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  rowToCampaignActivation,
  rowToCampaignActivationTarget,
  rowToCampaignActivationEvent,
  type CampaignActivationRow,
  type CampaignActivationTargetRow,
  type CampaignActivationEventRow,
} from '../mappers/campaign-activation.mapper';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 20;

const ACTIVATION_NON_TERMINAL_STATUSES = [
  'pending',
  'preparing',
  'ready',
  'scheduled',
  'executing',
] as const;

// ─── RPC helper type — mismo criterio que SupabaseCampaignRepository ──────────

type RpcCapableClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

// ─── Repository ───────────────────────────────────────────────────────────────

export class SupabaseCampaignActivationRepository implements CampaignActivationRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // ── findById ─────────────────────────────────────────────────────────────────

  async findById(
    id: CampaignActivationId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignActivation>> {
    const { data, error } = await this.supabase
      .from('campaign_activations')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) {
      return err({
        code: 'NOT_FOUND' as const,
        message: `Activación ${id} no encontrada en la organización`,
      });
    }

    try {
      return ok(rowToCampaignActivation(data as unknown as CampaignActivationRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos de la activación',
        details: mappingError,
      });
    }
  }

  // ── findByIdWithTargets ────────────────────────────────────────────────────────

  async findByIdWithTargets(
    id: CampaignActivationId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignActivationWithTargets>> {
    const activationResult = await this.findById(id, organizationId);
    if (!activationResult.success) return activationResult;

    const targetsResult = await this.listTargets(id, organizationId);
    if (!targetsResult.success) return targetsResult;

    return ok({
      ...activationResult.value,
      targets: targetsResult.value,
    });
  }

  // ── findActiveByCampaign ───────────────────────────────────────────────────────

  async findActiveByCampaign(
    campaignId: CampaignId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignActivation | null>> {
    const { data, error } = await this.supabase
      .from('campaign_activations')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('organization_id', organizationId)
      .in('status', ACTIVATION_NON_TERMINAL_STATUSES as unknown as string[])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al buscar la activación activa de la campaña',
        details: error.message,
      });
    }

    if (!data) return ok(null);

    try {
      return ok(rowToCampaignActivation(data as unknown as CampaignActivationRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar la activación activa de la campaña',
        details: mappingError,
      });
    }
  }

  // ── findByCampaign ─────────────────────────────────────────────────────────────

  async findByCampaign(
    campaignId: CampaignId,
    organizationId: OrganizationId,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<CampaignActivation>> {
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await this.supabase
      .from('campaign_activations')
      .select('*', { count: 'exact' })
      .eq('campaign_id', campaignId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return emptyPaginatedResult(page, pageSize);
    }

    return buildPaginatedResult(data ?? [], count ?? 0, page, pageSize, (row) =>
      rowToCampaignActivation(row as unknown as CampaignActivationRow),
    );
  }

  // ── findByOrganization ─────────────────────────────────────────────────────────

  async findByOrganization(
    filter: CampaignActivationFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<CampaignActivation>> {
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .from('campaign_activations')
      .select('*', { count: 'exact' })
      .eq('organization_id', filter.organizationId);

    if (filter.clientId !== undefined) {
      query = query.eq('client_id', filter.clientId);
    }
    if (filter.campaignId !== undefined) {
      query = query.eq('campaign_id', filter.campaignId);
    }
    if (filter.status !== undefined) {
      query = query.eq('status', filter.status);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return emptyPaginatedResult(page, pageSize);
    }

    return buildPaginatedResult(data ?? [], count ?? 0, page, pageSize, (row) =>
      rowToCampaignActivation(row as unknown as CampaignActivationRow),
    );
  }

  // ── create ─────────────────────────────────────────────────────────────────────

  /**
   * INSERT directo — ver nota de cabecera de este archivo. `approvedSnapshot`
   * se persiste tal cual (ya construido y validado por el caller — este
   * repositorio NUNCA reconstruye ni normaliza el snapshot).
   */
  async create(input: CreateCampaignActivationInput): Promise<Result<CampaignActivation>> {
    const { data: row, error } = await this.supabase
      .from('campaign_activations')
      .insert({
        organization_id: String(input.organizationId),
        client_id: String(input.clientId),
        campaign_id: String(input.campaignId),
        campaign_approval_id: String(input.campaignApprovalId),
        status: 'pending',
        approved_snapshot: input.approvedSnapshot,
        notes: input.notes ?? null,
        metadata: input.metadata ?? {},
        created_by: input.createdBy,
      })
      .select('*')
      .single();

    if (error || !row) {
      return err(mapActivationWriteError(error?.message, 'Error al crear la activación'));
    }

    try {
      return ok(rowToCampaignActivation(row as unknown as CampaignActivationRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos de la activación creada',
        details: mappingError,
      });
    }
  }

  // ── cancel — RPC cancel_campaign_activation ────────────────────────────────────

  async cancel(
    id: CampaignActivationId,
    organizationId: OrganizationId,
    _actorUserId: string,
    reason: string,
  ): Promise<Result<CampaignActivation>> {
    const existing = await this.findById(id, organizationId);
    if (!existing.success) return existing;

    const { error } = await (this.supabase as unknown as RpcCapableClient).rpc(
      'cancel_campaign_activation',
      { p_activation_id: id, p_reason: reason },
    );

    if (error) {
      return err(mapActivationRpcError(error.message, 'Error al cancelar la activación'));
    }

    return this.findById(id, organizationId);
  }

  // ── listTargets ────────────────────────────────────────────────────────────────

  async listTargets(
    activationId: CampaignActivationId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignActivationTarget[]>> {
    const { data, error } = await this.supabase
      .from('campaign_activation_targets')
      .select('*')
      .eq('activation_id', activationId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true });

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al listar los canales de la activación',
        details: error.message,
      });
    }

    try {
      const items = (data ?? []).map((row) =>
        rowToCampaignActivationTarget(row as unknown as CampaignActivationTargetRow),
      );
      return ok(items);
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los canales de la activación',
        details: mappingError,
      });
    }
  }

  // ── findTargetById ─────────────────────────────────────────────────────────────

  async findTargetById(
    id: CampaignActivationTargetId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignActivationTarget>> {
    const { data, error } = await this.supabase
      .from('campaign_activation_targets')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) {
      return err({
        code: 'NOT_FOUND' as const,
        message: `Canal de activación ${id} no encontrado en la organización`,
      });
    }

    try {
      return ok(rowToCampaignActivationTarget(data as unknown as CampaignActivationTargetRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos del canal de activación',
        details: mappingError,
      });
    }
  }

  // ── addTarget ──────────────────────────────────────────────────────────────────

  async addTarget(input: CreateActivationTargetInput): Promise<Result<CampaignActivationTarget>> {
    const { data: row, error } = await this.supabase
      .from('campaign_activation_targets')
      .insert({
        activation_id: String(input.activationId),
        organization_id: String(input.organizationId),
        client_id: String(input.clientId),
        channel: input.channel,
        provider: input.provider,
        placement: input.placement ?? null,
        client_integration_id: input.clientIntegrationId ? String(input.clientIntegrationId) : null,
        status: 'pending',
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !row) {
      return err(mapActivationWriteError(error?.message, 'Error al agregar el canal de activación'));
    }

    try {
      return ok(rowToCampaignActivationTarget(row as unknown as CampaignActivationTargetRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar el canal de activación creado',
        details: mappingError,
      });
    }
  }

  // ── removeTarget ───────────────────────────────────────────────────────────────

  /**
   * DELETE físico — solo permitido mientras la activation padre sigue
   * 'pending' (reforzado por el trigger `check_activation_target_deletable`
   * de la migración; este método no revalida esa condición en TS, la BD es
   * la fuente de verdad).
   */
  async removeTarget(
    id: CampaignActivationTargetId,
    organizationId: OrganizationId,
  ): Promise<Result<void>> {
    const { error, count } = await this.supabase
      .from('campaign_activation_targets')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      return err(mapActivationWriteError(error.message, 'Error al eliminar el canal de activación'));
    }

    if (!count) {
      return err({
        code: 'NOT_FOUND' as const,
        message: `Canal de activación ${id} no encontrado en la organización`,
      });
    }

    return ok(undefined);
  }

  // ── prepareTarget — RPC prepare_activation_target ──────────────────────────────

  async prepareTarget(
    id: CampaignActivationTargetId,
    organizationId: OrganizationId,
    _actorUserId: string,
    checklist?: Record<string, unknown> | null,
  ): Promise<Result<CampaignActivationTarget>> {
    const existing = await this.findTargetById(id, organizationId);
    if (!existing.success) return existing;

    const { error } = await (this.supabase as unknown as RpcCapableClient).rpc(
      'prepare_activation_target',
      { p_target_id: id, p_checklist: checklist ?? null },
    );

    if (error) {
      return err(mapActivationRpcError(error.message, 'Error al preparar el canal de activación'));
    }

    return this.findTargetById(id, organizationId);
  }

  // ── markTargetReady — RPC mark_activation_target_ready ─────────────────────────

  async markTargetReady(
    id: CampaignActivationTargetId,
    organizationId: OrganizationId,
    _actorUserId: string,
  ): Promise<Result<CampaignActivationTarget>> {
    const existing = await this.findTargetById(id, organizationId);
    if (!existing.success) return existing;

    const { error } = await (this.supabase as unknown as RpcCapableClient).rpc(
      'mark_activation_target_ready',
      { p_target_id: id },
    );

    if (error) {
      return err(mapActivationRpcError(error.message, 'Error al marcar como listo el canal de activación'));
    }

    return this.findTargetById(id, organizationId);
  }

  // ── markTargetPublished — RPC mark_activation_target_published ─────────────────

  async markTargetPublished(
    id: CampaignActivationTargetId,
    organizationId: OrganizationId,
    _actorUserId: string,
    externalReference?: string | null,
    note?: string | null,
  ): Promise<Result<CampaignActivationTarget>> {
    const existing = await this.findTargetById(id, organizationId);
    if (!existing.success) return existing;

    const { error } = await (this.supabase as unknown as RpcCapableClient).rpc(
      'mark_activation_target_published',
      {
        p_target_id: id,
        p_external_reference: externalReference ?? null,
        p_note: note ?? null,
      },
    );

    if (error) {
      return err(mapActivationRpcError(error.message, 'Error al marcar como publicado el canal de activación'));
    }

    return this.findTargetById(id, organizationId);
  }

  // ── markTargetPublishing — RPC mark_activation_target_publishing (Phase 8B.1) ──

  async markTargetPublishing(
    id: CampaignActivationTargetId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignActivationTarget>> {
    const existing = await this.findTargetById(id, organizationId);
    if (!existing.success) return existing;

    const { error } = await (this.supabase as unknown as RpcCapableClient).rpc(
      'mark_activation_target_publishing',
      { p_target_id: id },
    );

    if (error) {
      return err(mapActivationRpcError(error.message, 'Error al marcar el canal como en publicación'));
    }

    return this.findTargetById(id, organizationId);
  }

  // ── markTargetFailed — RPC mark_activation_target_failed (Phase 8B.1) ──────────

  async markTargetFailed(
    id: CampaignActivationTargetId,
    organizationId: OrganizationId,
    failureCode: string,
    failureMessage?: string | null,
  ): Promise<Result<CampaignActivationTarget>> {
    const existing = await this.findTargetById(id, organizationId);
    if (!existing.success) return existing;

    const { error } = await (this.supabase as unknown as RpcCapableClient).rpc(
      'mark_activation_target_failed',
      { p_target_id: id, p_failure_code: failureCode, p_failure_message: failureMessage ?? null },
    );

    if (error) {
      return err(mapActivationRpcError(error.message, 'Error al marcar el canal como fallido'));
    }

    return this.findTargetById(id, organizationId);
  }

  // ── cancelTarget — RPC cancel_activation_target ─────────────────────────────────

  async cancelTarget(
    id: CampaignActivationTargetId,
    organizationId: OrganizationId,
    _actorUserId: string,
    reason: string,
  ): Promise<Result<CampaignActivationTarget>> {
    const existing = await this.findTargetById(id, organizationId);
    if (!existing.success) return existing;

    const { error } = await (this.supabase as unknown as RpcCapableClient).rpc(
      'cancel_activation_target',
      { p_target_id: id, p_reason: reason },
    );

    if (error) {
      return err(mapActivationRpcError(error.message, 'Error al cancelar el canal de activación'));
    }

    return this.findTargetById(id, organizationId);
  }

  // ── listEvents ─────────────────────────────────────────────────────────────────

  async listEvents(
    activationId: CampaignActivationId,
    organizationId: OrganizationId,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<CampaignActivationEvent>> {
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await this.supabase
      .from('campaign_activation_events')
      .select('*', { count: 'exact' })
      .eq('activation_id', activationId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return emptyPaginatedResult(page, pageSize);
    }

    return buildPaginatedResult(data ?? [], count ?? 0, page, pageSize, (row) =>
      rowToCampaignActivationEvent(row as unknown as CampaignActivationEventRow),
    );
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

function buildPaginatedResult<T>(
  rows: unknown[],
  total: number,
  page: number,
  pageSize: number,
  mapper: (row: unknown) => T,
): PaginatedResult<T> {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  const items = mapSafe(rows, mapper);

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
 * Mapea errores de INSERT/DELETE directo (no-RPC) a un ErrorCode del
 * proyecto. Los INSERTs a campaign_activations/campaign_activation_targets
 * pueden fallar por: RLS (permission denied), triggers de integridad
 * (check_activation_source, check_activation_target_match — mensaje crudo de
 * Postgres vía RAISE EXCEPTION), o el índice único parcial de idempotencia
 * (23505 duplicate key).
 */
function mapActivationWriteError(
  rawMessage: string | undefined,
  fallbackMessage: string,
): { code: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR'; message: string } {
  const msg = rawMessage ?? fallbackMessage;

  if (msg.includes('duplicate key') || msg.includes('uq_campaign_activations_active_per_campaign') || msg.includes('uq_activation_targets_dedupe')) {
    return { code: 'CONFLICT', message: msg };
  }
  if (msg.includes('permission denied') || msg.includes('row-level security')) {
    return { code: 'FORBIDDEN', message: msg };
  }
  if (
    msg.includes('not approved') ||
    msg.includes('does not belong') ||
    msg.includes('mismatch') ||
    msg.includes('is not a valid approval')
  ) {
    return { code: 'VALIDATION_ERROR', message: msg };
  }
  if (msg.includes('not found')) {
    return { code: 'NOT_FOUND', message: msg };
  }
  return { code: 'INTERNAL_ERROR', message: msg };
}

/**
 * Mapea el mensaje de error crudo de las RPCs de transición (SECCIÓN F de
 * la migración) a un ErrorCode del proyecto — mismo criterio que
 * `mapCampaignRpcError` en SupabaseCampaignRepository.
 */
function mapActivationRpcError(
  rawMessage: string | undefined,
  fallbackMessage: string,
): { code: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR'; message: string } {
  const msg = rawMessage ?? fallbackMessage;

  if (msg.includes('not found')) {
    return { code: 'NOT_FOUND', message: msg };
  }
  if (msg.includes('reason is required')) {
    return { code: 'VALIDATION_ERROR', message: msg };
  }
  if (msg.includes('lacks') && msg.includes('role')) {
    return { code: 'FORBIDDEN', message: msg };
  }
  if (msg.includes('authentication required')) {
    return { code: 'FORBIDDEN', message: msg };
  }
  if (
    msg.includes('is not pending') ||
    msg.includes('is not preparing') ||
    msg.includes('is not ready/scheduled') ||
    msg.includes('is already terminal') ||
    msg.includes('while publishing') ||
    msg.includes('while executing')
  ) {
    return { code: 'CONFLICT', message: msg };
  }
  return { code: 'INTERNAL_ERROR', message: msg };
}
