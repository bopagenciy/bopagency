/**
 * getCampaign — Phase 7E.
 *
 * Obtiene una campaña por ID dentro de la organización. Wrapper delgado
 * sobre `CampaignRepository.findById` (mismo patrón que `getAutomation`,
 * Phase 6E) — no existía ningún use case dedicado a lectura individual
 * hasta ahora porque ningún caller lo necesitaba (7B–7D solo listaban o
 * mutaban). La UI de Campaign Studio (7E) sí necesita una página de detalle
 * por campaña, de ahí este use case.
 *
 * organizationId aísla automáticamente el acceso — una campaña de otra
 * organización retorna el mismo NOT_FOUND que una campaña inexistente
 * (mismo criterio que el resto del proyecto, ver CampaignRepository.findById).
 */

import type { Result } from '@bop-agency/shared';
import type { Campaign, CampaignId, CampaignRepository } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type GetCampaignInput = {
  readonly campaignId: CampaignId;
  readonly organizationId: OrganizationId;
};

export type GetCampaignDeps = {
  campaignRepository: CampaignRepository;
  logger: LoggerPort;
};

export async function getCampaign(
  input: GetCampaignInput,
  deps: GetCampaignDeps,
): Promise<Result<Campaign>> {
  deps.logger.debug('getCampaign', {
    campaignId: input.campaignId,
    organizationId: input.organizationId,
  });

  return deps.campaignRepository.findById(input.campaignId, input.organizationId);
}
