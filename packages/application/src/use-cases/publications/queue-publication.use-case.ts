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

import { googleAdsActivationConfigSchema, ok, isOk, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  CampaignPublicationJob,
  CampaignActivationTargetId,
  CampaignPublicationJobId,
  CampaignPublicationRepository,
  CampaignActivationRepository,
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
  activationRepository?: CampaignActivationRepository;
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

  // Defense-in-depth: Si activationRepository está disponible y el target es de canal google_ads, verificar snapshot
  if (deps.activationRepository) {
    const targetResult = await deps.activationRepository.findTargetById(
      input.targetId as CampaignActivationTargetId,
      input.organizationId,
    );
    if (isOk(targetResult) && targetResult.value && targetResult.value.channel === 'google_ads') {
      const activationResult = await deps.activationRepository.findById(
        targetResult.value.activationId,
        input.organizationId,
      );
      if (!isOk(activationResult) || !activationResult.value) {
        return err({
          code: 'VALIDATION_ERROR' as const,
          message: 'No se encontró la activación asociada al target de Google Ads',
        });
      }
      const rawConfig = activationResult.value.approvedSnapshot.googleAdsConfig;
      if (!rawConfig) {
        return err({
          code: 'VALIDATION_ERROR' as const,
          message: 'El target de Google Ads requiere una configuración de activación (googleAdsConfig) válida en el snapshot aprobado para encolar publicación',
        });
      }
      const configCheck = googleAdsActivationConfigSchema.safeParse(rawConfig);
      if (!configCheck.success) {
        return err({
          code: 'VALIDATION_ERROR' as const,
          message: `Configuración de Google Ads en snapshot es inválida: ${configCheck.error.errors.map((e) => e.message).join('; ')}`,
        });
      }
    }
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
