/**
 * SupabaseCampaignApprovalRepository
 *
 * Implementación de CampaignApprovalRepository respaldada por Supabase —
 * Phase 7C. SOLO LECTURA — ver la nota extensa en el dominio
 * (campaign-approval.repository.ts) sobre por qué no existe un método de
 * escritura aquí: los INSERTs a campaign_approvals ocurren exclusivamente
 * dentro de las RPCs approve_campaign/reject_campaign.
 *
 * Todas las operaciones filtran por organization_id (multi-tenant). Usa el
 * cliente del usuario con RLS activo — nunca service_role en esta capa.
 */

import { ok, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  CampaignApproval,
  CampaignApprovalRepository,
  CampaignId,
} from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rowToCampaignApproval, type CampaignApprovalRow } from '../mappers/campaign-approval.mapper';

export class SupabaseCampaignApprovalRepository implements CampaignApprovalRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // ── findByCampaignId ──────────────────────────────────────────────────────────

  async findByCampaignId(
    campaignId: CampaignId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignApproval[]>> {
    const { data, error } = await this.supabase
      .from('campaign_approvals')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al listar el historial de decisiones de la campaña',
        details: error.message,
      });
    }

    try {
      const items = (data ?? []).map((row) =>
        rowToCampaignApproval(row as unknown as CampaignApprovalRow),
      );
      return ok(items);
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar el historial de decisiones de la campaña',
        details: mappingError,
      });
    }
  }

  // ── findLatestByCampaignId ────────────────────────────────────────────────────

  async findLatestByCampaignId(
    campaignId: CampaignId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignApproval | null>> {
    const { data, error } = await this.supabase
      .from('campaign_approvals')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al buscar la última decisión de la campaña',
        details: error.message,
      });
    }

    if (!data) return ok(null);

    try {
      return ok(rowToCampaignApproval(data as unknown as CampaignApprovalRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar la última decisión de la campaña',
        details: mappingError,
      });
    }
  }
}
