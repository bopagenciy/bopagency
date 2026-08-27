/**
 * getPublicationJob — Phase 8B.2.
 *
 * Lectura pura de un `CampaignPublicationJob` por id, con sus attempts
 * (agregado completo). Requiere solo membresía (cualquier rol, incluido
 * viewer) — mismo criterio que `getCampaignActivation` (8A.2).
 */

import { isOk, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  CampaignPublicationJobId,
  CampaignPublicationJobWithAttempts,
  CampaignPublicationRepository,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import { notOrganizationMember } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type GetPublicationJobInput = {
  readonly jobId: string;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
};

export type GetPublicationJobDeps = {
  publicationRepository: CampaignPublicationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function getPublicationJob(
  input: GetPublicationJobInput,
  deps: GetPublicationJobDeps,
): Promise<Result<CampaignPublicationJobWithAttempts>> {
  deps.logger.debug('getPublicationJob', {
    jobId: input.jobId,
    organizationId: input.organizationId,
  });

  const memberResult = await deps.organizationRepository.findMember(
    input.organizationId,
    input.actorUserId,
  );
  if (!isOk(memberResult)) {
    return err(notOrganizationMember());
  }

  return deps.publicationRepository.findJobWithAttempts(
    input.jobId as CampaignPublicationJobId,
    input.organizationId,
  );
}
