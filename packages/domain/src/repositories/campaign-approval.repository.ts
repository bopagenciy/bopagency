/**
 * CampaignApprovalRepository — contrato de dominio para la tabla
 * `campaign_approvals`, Phase 7C.
 *
 * SOLO LECTURA a propósito. NO existe un método `create`/`insert`: la
 * escritura del audit trail ocurre exclusivamente dentro de las RPCs
 * `approve_campaign`/`reject_campaign` (SECURITY DEFINER), como parte de la
 * misma transacción que actualiza `campaigns.status`. Añadir aquí un método
 * de escritura reintroduciría la posibilidad de insertar una fila de
 * "decisión" desconectada del estado real de la campaña (exactamente el gap
 * que Phase 7C cerró retirando la policy `campaign_approvals_insert` — ver
 * PHASE_7C_APPROVAL_COMPLIANCE_REPORT.md §"Cambios en campaign_approvals").
 */

import type { Result } from '@bop-agency/shared';
import type { CampaignApproval } from '../entities/campaign-approval';
import type { CampaignId } from '../entities/campaign';
import type { OrganizationId } from '../entities/organization';

export interface CampaignApprovalRepository {
  /**
   * Lista el historial completo de decisiones de una campaña, más reciente
   * primero. Aislado siempre por organizationId.
   */
  findByCampaignId(
    campaignId: CampaignId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignApproval[]>>;

  /**
   * Última decisión registrada para una campaña (o null si nunca se decidió
   * — p.ej. sigue en 'draft'/'review'). Aislado siempre por organizationId.
   */
  findLatestByCampaignId(
    campaignId: CampaignId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignApproval | null>>;
}
