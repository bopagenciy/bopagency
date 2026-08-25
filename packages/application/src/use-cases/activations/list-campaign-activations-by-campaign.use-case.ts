/**
 * listCampaignActivationsByCampaign — Phase 8A.2.
 *
 * Lectura pura y paginada de las activations de una campaña, aislada por
 * organización. Solo requiere membresía (cualquier rol — matriz de roles
 * §2: "viewer: read only"). NUNCA muta tasks/alerts.
 *
 * Tipo de retorno alineado con el resto del proyecto (`listCampaigns`,
 * `listClients`, Phase 7E/6): `Result<PaginatedResult<T>>` vía `ok()`/`err()`,
 * no una unión ad-hoc de tipos de error.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  CampaignActivation,
  CampaignActivationRepository,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import type { CampaignId } from '@bop-agency/domain';
import { notOrganizationMember } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type ListCampaignActivationsByCampaignInput = {
  readonly campaignId: CampaignId;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
  readonly pagination: PaginationParams;
};

export type ListCampaignActivationsByCampaignDeps = {
  activationRepository: CampaignActivationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function listCampaignActivationsByCampaign(
  input: ListCampaignActivationsByCampaignInput,
  deps: ListCampaignActivationsByCampaignDeps,
): Promise<Result<PaginatedResult<CampaignActivation>>> {
  deps.logger.debug('listCampaignActivationsByCampaign', {
    campaignId: input.campaignId,
    organizationId: input.organizationId,
  });

  const memberResult = await deps.organizationRepository.findMember(
    input.organizationId,
    input.actorUserId,
  );
  if (!isOk(memberResult)) {
    return err(notOrganizationMember());
  }

  const result = await deps.activationRepository.findByCampaign(
    input.campaignId,
    input.organizationId,
    input.pagination,
  );
  return ok(result);
}
