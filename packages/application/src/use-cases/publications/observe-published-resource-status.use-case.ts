/**
 * observePublishedResourceStatus — Phase 8G.1 & Phase 8G.1A.
 *
 * Use Case para ejecutar observación en LECTURA PURA (`read-only`) del estado
 * operativo actual en el proveedor y persistir de forma atómica (append-only)
 * solo las observaciones significativas (`first` o `change`).
 *
 * AUTORIZACIÓN: Cualquier miembro de la organización con rol viewer+.
 * INVARIANTE PRIMARIO: La observación NUNCA altera el historial de publicación.
 * El job de publicación completado permanece `succeeded` para siempre.
 * CERO reintentos automáticos, CERO mutaciones al proveedor.
 */

import { ok, err, isOk, type Result } from '@bop-agency/shared';
import type {
  CampaignPublicationJob,
  CampaignPublicationJobId,
  CampaignPublicationRepository,
  CampaignActivationRepository,
  OrganizationRepository,
  OrganizationId,
  RecordProviderObservationResult,
} from '@bop-agency/domain';
import { notOrganizationMember } from '@bop-agency/domain';
import type {
  PublicationProviderMonitorRegistry,
  ProviderResourceObservation,
} from '../../ports/publication-provider-monitor.port';
import type { LoggerPort } from '../../ports/logger.port';

export type ObservePublishedResourceStatusInput = {
  readonly jobId: string;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
};

export type ObservePublishedResourceStatusDeps = {
  readonly publicationRepository: CampaignPublicationRepository;
  readonly activationRepository?: CampaignActivationRepository;
  readonly organizationRepository: OrganizationRepository;
  readonly monitorRegistry: PublicationProviderMonitorRegistry;
  readonly logger: LoggerPort;
};

export type ObservePublishedResourceStatusOutput = {
  readonly job: CampaignPublicationJob;
  readonly observation: ProviderResourceObservation;
  readonly persistence?: RecordProviderObservationResult | undefined;
};

export async function observePublishedResourceStatus(
  input: ObservePublishedResourceStatusInput,
  deps: ObservePublishedResourceStatusDeps,
): Promise<Result<ObservePublishedResourceStatusOutput>> {
  deps.logger.info('observePublishedResourceStatus: initiating provider status observation', {
    jobId: input.jobId,
    organizationId: input.organizationId,
  });

  // 1. Membership check (any org member with role viewer+ has read authorization)
  const memberResult = await deps.organizationRepository.findMember(
    input.organizationId,
    input.actorUserId,
  );
  if (!isOk(memberResult)) {
    return err(notOrganizationMember());
  }

  // 2. Fetch Job & attempts
  const jobWithAttemptsRes = await deps.publicationRepository.findJobWithAttempts(
    input.jobId as CampaignPublicationJobId,
    input.organizationId,
  );
  if (!isOk(jobWithAttemptsRes) || !jobWithAttemptsRes.value) {
    return err({ code: 'NOT_FOUND', message: `Job ${input.jobId} not found` });
  }
  const job = jobWithAttemptsRes.value;

  // 3. Status Check — monitoring applies exclusively to succeeded jobs
  if (job.status !== 'succeeded') {
    return err({
      code: 'VALIDATION_ERROR',
      message: `Job is in status '${job.status}'; monitoring applies exclusively to succeeded publication jobs`,
    });
  }

  const externalId = (job as { externalId?: string | null }).externalId || null;

  if (!externalId) {
    return err({
      code: 'VALIDATION_ERROR',
      message: `Job ${input.jobId} is succeeded but lacks externalId required for provider monitoring`,
    });
  }

  // 4. Resolve Monitor
  const monitor = deps.monitorRegistry.resolve(job.channel, job.provider);
  if (!monitor) {
    deps.logger.warn('observePublishedResourceStatus: no monitor registered for channel/provider', {
      channel: job.channel,
      provider: job.provider,
    });
    const fallbackObservation: ProviderResourceObservation = {
      provider: job.provider,
      channel: job.channel,
      externalId,
      observedAt: new Date().toISOString(),
      availability: 'unavailable',
      unavailabilityReason: 'CHANNEL_NOT_CONFIGURED',
      metadata: { message: `No monitor registered for channel '${job.channel}' and provider '${job.provider}'` },
    };
    return ok({ job, observation: fallbackObservation });
  }

  let targetMetadata: Record<string, unknown> | null = null;
  if (deps.activationRepository) {
    const targetRes = await deps.activationRepository.findTargetById(job.targetId, input.organizationId);
    if (isOk(targetRes) && targetRes.value) {
      targetMetadata = (targetRes.value.metadata as Record<string, unknown>) || null;
    }
  }

  // 5. Execute Read-Only Status Observation
  const observationRes = await monitor.observe({
    jobId: String(job.id),
    targetId: String(job.targetId),
    organizationId: input.organizationId,
    clientId: String(job.clientId),
    channel: job.channel,
    provider: job.provider,
    externalId,
    clientIntegrationId: job.clientIntegrationId ? String(job.clientIntegrationId) : null,
    attemptMetadata: (job.metadata as Record<string, unknown>) || null,
    targetMetadata,
  });

  if (!isOk(observationRes)) {
    deps.logger.error('observePublishedResourceStatus: monitor port error', { error: observationRes });
    return err({ code: 'INTERNAL_ERROR', message: 'Failed executing provider status observation' });
  }

  const obs = observationRes.value;

  // 6. Record Observation via RPC record_provider_observation (Phase 8G.1A atomic persistence & change detection)
  let persistenceResult: RecordProviderObservationResult | undefined = undefined;

  const recordRes = await deps.publicationRepository.recordProviderObservation({
    organizationId: input.organizationId,
    clientId: String(job.clientId),
    jobId: job.id,
    targetId: String(job.targetId),
    provider: job.provider,
    channel: job.channel,
    externalId,
    availability: obs.availability,
    unavailabilityReason: obs.unavailabilityReason || null,
    resourceStatus: obs.resourceStatus || null,
    servingStatus: obs.servingStatus || null,
    primaryStatus: obs.primaryStatus || null,
    primaryStatusReasons: obs.primaryStatusReasons || [],
    observedAt: new Date(obs.observedAt),
    requestId: (obs.metadata?.['requestId'] as string) || null,
    metadata: obs.metadata || {},
  });

  if (isOk(recordRes)) {
    persistenceResult = recordRes.value;
  }

  // 7. Return Observation & Persistence Result — IMMUTABLE GUARANTEE: Job DB status remains 'succeeded' forever!
  return ok({ job, observation: obs, persistence: persistenceResult });
}
