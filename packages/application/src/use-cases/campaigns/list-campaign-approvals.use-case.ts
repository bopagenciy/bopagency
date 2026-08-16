/**
 * listCampaignApprovals — Phase 7C.
 *
 * Lee el audit trail append-only de una campaña (más reciente primero).
 * Disponible para cualquier rol con acceso de lectura (matriz aprobada:
 * ver✅ para los 5 roles) — no requiere chequeo de rol adicional, la misma
 * política que ya aplica a `listCampaigns`. La campaña se carga primero
 * únicamente para producir un NOT_FOUND claro si no existe o pertenece a
 * otra organización, antes de consultar el historial.
 */

import { isOk, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  CampaignApproval,
  CampaignApprovalRepository,
  CampaignId,
  CampaignRepository,
} from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import { campaignIdSchema } from '@bop-agency/shared';
import type { LoggerPort } from '../../ports/logger.port';

export type ListCampaignApprovalsInput = {
  readonly campaignId: string;
  /** SIEMPRE resuelto en el servidor desde la sesión — nunca del cliente. */
  readonly organizationId: OrganizationId;
};

export type ListCampaignApprovalsDeps = {
  campaignRepository: CampaignRepository;
  campaignApprovalRepository: CampaignApprovalRepository;
  logger: LoggerPort;
};

export async function listCampaignApprovals(
  input: ListCampaignApprovalsInput,
  deps: ListCampaignApprovalsDeps,
): Promise<Result<CampaignApproval[]>> {
  deps.logger.debug('listCampaignApprovals', {
    campaignId: input.campaignId,
    organizationId: input.organizationId,
  });

  const parsed = campaignIdSchema.safeParse(input.campaignId);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
  }
  const campaignId = parsed.data as CampaignId;

  const campaignResult = await deps.campaignRepository.findById(campaignId, input.organizationId);
  if (!isOk(campaignResult)) {
    return campaignResult;
  }

  return deps.campaignApprovalRepository.findByCampaignId(campaignId, input.organizationId);
}
