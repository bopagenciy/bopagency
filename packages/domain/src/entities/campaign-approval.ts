import type { OrganizationId } from './organization';
import type { CampaignId } from './campaign';

/**
 * CampaignApproval — Phase 7B.
 *
 * Modela el audit trail append-only de decisiones sobre una campaña
 * (tabla `campaign_approvals`). Solo se define el TIPO en Phase 7B: no se
 * crea `CampaignApprovalRepository` todavía porque ningún use case de 7B lo
 * consume (approveCampaign/rejectCampaign son Phase 7C — ver
 * PHASE_7B_PERSISTENCE_REPORT.md "Deuda técnica diferida a 7C"). Construir
 * el repositorio ahora sería sobrearquitectura sin un caller real.
 */
export type CampaignApprovalId = string & { readonly _brand: 'CampaignApprovalId' };

export type CampaignApprovalAction = 'approved' | 'rejected';

export type CampaignApproval = {
  readonly id: CampaignApprovalId;
  readonly organizationId: OrganizationId;
  readonly campaignId: CampaignId;
  readonly action: CampaignApprovalAction;
  /** Requerida (no vacía) cuando action === 'rejected' — reforzado también por CHECK en BD. */
  readonly note: string | null;
  readonly actorUserId: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
};
