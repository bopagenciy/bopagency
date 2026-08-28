/**
 * retryPublication — Phase 8B.2.
 *
 * Composición conveniente de los dos pasos explícitos del modelo de retry
 * de 8B.1 (Run 4): (1) `preparePublicationRetry` — resetea el target
 * `failed -> ready` (strategist+, exige que el job referenciado esté
 * `failed` con categoría retryable); (2) `queuePublication` — crea el job
 * NUEVO con `retryOfJobId` encadenado (operator+, ya satisfecho por
 * strategist+ vía la jerarquía de roles).
 *
 * El job histórico original NUNCA se muta — permanece `failed`,
 * inmutable, con su propio audit trail intacto. Este use case NO
 * colapsa los dos pasos en una sola RPC nueva — cada paso sigue siendo
 * una llamada independiente y auditable (mismo criterio arquitectónico
 * que llevó a diseñar `prepare_publication_retry` como RPC separada en
 * 8B.1 Run 4, en vez de fusionarla en `create_publication_job`).
 *
 * Si el paso 1 falla (p.ej. job no es `failed`, o ya existe un job activo
 * para el target), el paso 2 NUNCA se ejecuta — no queda ningún job
 * nuevo creado a medias.
 */

import { isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  CampaignPublicationJob,
  CampaignPublicationRepository,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';
import { preparePublicationRetry } from './prepare-publication-retry.use-case';
import { queuePublication } from './queue-publication.use-case';

export type RetryPublicationInput = {
  readonly jobId: string;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
  readonly note?: string | null;
};

export type RetryPublicationDeps = {
  publicationRepository: CampaignPublicationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function retryPublication(
  input: RetryPublicationInput,
  deps: RetryPublicationDeps,
): Promise<Result<CampaignPublicationJob>> {
  deps.logger.debug('retryPublication: begin', {
    jobId: input.jobId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  const prepared = await preparePublicationRetry(
    {
      jobId: input.jobId,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      note: input.note ?? null,
    },
    deps,
  );

  if (!isOk(prepared)) {
    deps.logger.warn('retryPublication: prepare step failed', { error: prepared });
    return prepared;
  }

  const targetId = prepared.value;

  const queued = await queuePublication(
    {
      targetId: String(targetId),
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      retryOfJobId: input.jobId,
    },
    deps,
  );

  if (!isOk(queued)) {
    deps.logger.error('retryPublication: queue step failed after prepare succeeded', {
      error: queued,
      resetTargetId: String(targetId),
    });
    return queued;
  }

  deps.logger.info('retryPublication: ok', {
    originalJobId: input.jobId,
    newJobId: String(queued.value.id),
    organizationId: input.organizationId,
  });

  return queued;
}
