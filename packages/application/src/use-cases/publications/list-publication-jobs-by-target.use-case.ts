/**
 * listPublicationJobsByTarget — Phase 8B.2.
 *
 * Historial completo (terminal + no-terminal) de jobs de publicación de un
 * `CampaignActivationTarget` — usa el método de lectura
 * `listJobsByTarget` agregado a `CampaignPublicationRepository` en esta
 * misma fase (ver report §1, no altera ninguna RPC/migración). Requiere
 * solo membresía.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  CampaignActivationTargetId,
  CampaignPublicationJob,
  CampaignPublicationRepository,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import { notOrganizationMember } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type ListPublicationJobsByTargetInput = {
  readonly targetId: string;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
  readonly pagination: PaginationParams;
};

export type ListPublicationJobsByTargetDeps = {
  publicationRepository: CampaignPublicationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function listPublicationJobsByTarget(
  input: ListPublicationJobsByTargetInput,
  deps: ListPublicationJobsByTargetDeps,
): Promise<Result<PaginatedResult<CampaignPublicationJob>>> {
  deps.logger.debug('listPublicationJobsByTarget', {
    targetId: input.targetId,
    organizationId: input.organizationId,
  });

  const memberResult = await deps.organizationRepository.findMember(
    input.organizationId,
    input.actorUserId,
  );
  if (!isOk(memberResult)) {
    return err(notOrganizationMember());
  }

  const result = await deps.publicationRepository.listJobsByTarget(
    input.targetId as CampaignActivationTargetId,
    input.organizationId,
    input.pagination,
  );
  return ok(result);
}
