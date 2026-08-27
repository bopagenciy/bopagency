/**
 * queuePublication — Phase 8B.2.
 *
 * Wrapper delgado sobre `CampaignPublicationRepository.createJob` (RPC
 * `create_publication_job`, rol operator+). Crea un
 * `CampaignPublicationJob` en `queued` para un `CampaignActivationTarget`
 * ya `ready` — la RPC re-valida authoritativamente elegibilidad (target
 * ready, sin job activo, no-manual, retry_of_job_id válido si se provee)
 * y es la única fuente de verdad; este use case solo agrega el mismo
 * chequeo de rol en profundidad que el resto de `application` (mismo
 * patrón que `prepareActivationTarget`/`markActivationTargetReady`, 8A.2).
 *
 * "Duplicate/non-eligible queue rejected" (ver kickoff de 8B.2) se cubre
 * enteramente por la RPC — este wrapper NUNCA duplica esa validación de
 * estado, solo la propaga.
 */

import { ok, isOk, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  CampaignPublicationJob,
  CampaignActivationTargetId,
  CampaignPublicationJobId,
  CampaignPublicationRepository,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import { hasMinimumRole, insufficientRole, notOrganizationMember } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type QueuePublicationInput = {
  readonly targetId: string;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
  /** Presente únicamente cuando este job es un retry explícito (ver `retryPublication`). */
  readonly retryOfJobId?: string | null;
};

export type QueuePublicationDeps = {
  publicationRepository: CampaignPublicationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function queuePublication(
  input: QueuePublicationInput,
  deps: QueuePublicationDeps,
): Promise<Result<CampaignPublicationJob>> {
  deps.logger.debug('queuePublication', {
    targetId: input.targetId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    retryOfJobId: input.retryOfJobId ?? null,
  });

  const memberResult = await deps.organizationRepository.findMember(
    input.organizationId,
    input.actorUserId,
  );
  if (!isOk(memberResult)) {
    return err(notOrganizationMember());
  }
  if (!hasMinimumRole(memberResult.value.role, 'operator')) {
    return err(insufficientRole('operator', memberResult.value.role));
  }

  const result = await deps.publicationRepository.createJob(
    {
      targetId: input.targetId as CampaignActivationTargetId,
      organizationId: input.organizationId,
      retryOfJobId: (input.retryOfJobId ?? null) as CampaignPublicationJobId | null,
    },
    input.actorUserId,
  );

  if (!isOk(result)) {
    deps.logger.error('queuePublication: repository error', { error: result });
    return result;
  }

  deps.logger.info('queuePublication: ok', {
    jobId: String(result.value.id),
    targetId: input.targetId,
    organizationId: input.organizationId,
  });

  return ok(result.value);
}
