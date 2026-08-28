/**
 * getPublicationTimeline — Phase 8B.2.
 *
 * Lista paginada de `CampaignPublicationEvent` (append-only, ver 8B.1) de
 * un job — el "timeline" de auditoría completo: job_queued, job_claimed,
 * job_started, job_succeeded/failed/marked_unknown_outcome,
 * job_cancelled, job_reconciled, webhook_received, retry_prepared.
 * Requiere solo membresía.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  CampaignPublicationJobId,
  CampaignPublicationEvent,
  CampaignPublicationRepository,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import { notOrganizationMember } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type GetPublicationTimelineInput = {
  readonly jobId: string;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
  readonly pagination: PaginationParams;
};

export type GetPublicationTimelineDeps = {
  publicationRepository: CampaignPublicationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function getPublicationTimeline(
  input: GetPublicationTimelineInput,
  deps: GetPublicationTimelineDeps,
): Promise<Result<PaginatedResult<CampaignPublicationEvent>>> {
  deps.logger.debug('getPublicationTimeline', {
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

  const result = await deps.publicationRepository.listEvents(
    input.jobId as CampaignPublicationJobId,
    input.organizationId,
    input.pagination,
  );
  return ok(result);
}
