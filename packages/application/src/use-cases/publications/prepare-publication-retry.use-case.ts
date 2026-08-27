/**
 * preparePublicationRetry — Phase 8B.2.
 *
 * Wrapper sobre `CampaignPublicationRepository.prepareRetry` (RPC
 * `prepare_publication_retry`, rol strategist+ — decisión operativa
 * intencional, ver 8B.1 Run 4). Retorna el `targetId` reseteado a
 * `ready`; el job histórico referenciado NUNCA se muta (permanece
 * `failed`, inmutable) — para crear el job de retry en sí, usar
 * `queuePublication({ targetId, retryOfJobId: jobId })` (ver
 * `retryPublication` para la composición conveniente de ambos pasos).
 *
 * El rol aquí es FIJO (strategist+, no depende del estado del job) —
 * la RPC valida authoritativamente que el job esté `failed` con una
 * `failureCategory` retryable; este wrapper no duplica esa validación de
 * estado (a diferencia de `cancelPublicationJob`, cuyo rol mínimo SÍ
 * depende del estado).
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  CampaignActivationTargetId,
  CampaignPublicationJobId,
  CampaignPublicationRepository,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import { hasMinimumRole, insufficientRole, notOrganizationMember } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type PreparePublicationRetryInput = {
  readonly jobId: string;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
  readonly note?: string | null;
};

export type PreparePublicationRetryDeps = {
  publicationRepository: CampaignPublicationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function preparePublicationRetry(
  input: PreparePublicationRetryInput,
  deps: PreparePublicationRetryDeps,
): Promise<Result<CampaignActivationTargetId>> {
  deps.logger.debug('preparePublicationRetry', {
    jobId: input.jobId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  const memberResult = await deps.organizationRepository.findMember(
    input.organizationId,
    input.actorUserId,
  );
  if (!isOk(memberResult)) {
    return err(notOrganizationMember());
  }
  if (!hasMinimumRole(memberResult.value.role, 'strategist')) {
    return err(insufficientRole('strategist', memberResult.value.role));
  }

  const result = await deps.publicationRepository.prepareRetry({
    jobId: input.jobId as CampaignPublicationJobId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    note: input.note ?? null,
  });

  if (!isOk(result)) {
    deps.logger.error('preparePublicationRetry: repository error', { error: result });
    return result;
  }

  deps.logger.info('preparePublicationRetry: ok', {
    jobId: input.jobId,
    resetTargetId: String(result.value),
    organizationId: input.organizationId,
  });

  return ok(result.value);
}
