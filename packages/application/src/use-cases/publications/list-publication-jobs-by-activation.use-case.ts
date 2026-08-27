/**
 * listPublicationJobsByActivation — Phase 8B.2.
 *
 * Lista paginada de jobs de publicación de una activation. Requiere solo
 * membresía (cualquier rol) — mismo criterio y misma forma de retorno que
 * `listCampaignActivationsByCampaign` (8A.2): `Result<PaginatedResult<T>>`.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  CampaignActivationId,
  CampaignPublicationJob,
  CampaignPublicationRepository,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import { notOrganizationMember } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type ListPublicationJobsByActivationInput = {
  readonly activationId: string;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
  readonly pagination: PaginationParams;
};

export type ListPublicationJobsByActivationDeps = {
  publicationRepository: CampaignPublicationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function listPublicationJobsByActivation(
  input: ListPublicationJobsByActivationInput,
  deps: ListPublicationJobsByActivationDeps,
): Promise<Result<PaginatedResult<CampaignPublicationJob>>> {
  deps.logger.debug('listPublicationJobsByActivation', {
    activationId: input.activationId,
    organizationId: input.organizationId,
  });

  const memberResult = await deps.organizationRepository.findMember(
    input.organizationId,
    input.actorUserId,
  );
  if (!isOk(memberResult)) {
    return err(notOrganizationMember());
  }

  const result = await deps.publicationRepository.listJobsByActivation(
    input.activationId as CampaignActivationId,
    input.organizationId,
    input.pagination,
  );
  return ok(result);
}
