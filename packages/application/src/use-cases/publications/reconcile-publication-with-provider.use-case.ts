/**
 * reconcilePublicationWithProvider — Phase 8G.0.
 *
 * Use Case para ejecutar reconciliación de lectura (`read-only`) contra el proveedor
 * de un job en estado `unknown_outcome`.
 *
 * AUTORIZACIÓN: Rol strategist+ ÚNICAMENTE.
 * INVARIANTE PRIMARIO: NUNCA publica, NUNCA reintenta automáticamente, NUNCA muta recursos.
 */

import { ok, err, isOk, type Result } from '@bop-agency/shared';
import type {
  CampaignPublicationJob,
  CampaignPublicationJobId,
  CampaignPublicationRepository,
  CampaignActivationRepository,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import { hasMinimumRole, insufficientRole, notOrganizationMember } from '@bop-agency/domain';
import type { PublicationReconcilerRegistry, ReconcileResult } from '../../ports/publication-reconciler.port';
import type { LoggerPort } from '../../ports/logger.port';

export type ReconcilePublicationWithProviderInput = {
  readonly jobId: string;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
  readonly note?: string;
};

export type ReconcilePublicationWithProviderDeps = {
  readonly publicationRepository: CampaignPublicationRepository;
  readonly activationRepository?: CampaignActivationRepository;
  readonly organizationRepository: OrganizationRepository;
  readonly reconcilerRegistry: PublicationReconcilerRegistry;
  readonly logger: LoggerPort;
};

export type ReconcilePublicationWithProviderOutput = {
  readonly job: CampaignPublicationJob;
  readonly reconcileResult: ReconcileResult;
};

export async function reconcilePublicationWithProvider(
  input: ReconcilePublicationWithProviderInput,
  deps: ReconcilePublicationWithProviderDeps,
): Promise<Result<ReconcilePublicationWithProviderOutput>> {
  deps.logger.info('reconcilePublicationWithProvider: initiating provider reconciliation', {
    jobId: input.jobId,
    organizationId: input.organizationId,
  });

  // 1. Rolcheck — strategist+
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

  // 2. Fetch Job & attempts
  const jobWithAttemptsRes = await deps.publicationRepository.findJobWithAttempts(
    input.jobId as CampaignPublicationJobId,
    input.organizationId,
  );
  if (!isOk(jobWithAttemptsRes) || !jobWithAttemptsRes.value) {
    return err({ code: 'NOT_FOUND', message: `Job ${input.jobId} not found` });
  }
  const job = jobWithAttemptsRes.value;

  if (job.status !== 'unknown_outcome') {
    return err({
      code: 'VALIDATION_ERROR',
      message: `Job is in status '${job.status}'; reconciliation applies exclusively to 'unknown_outcome' jobs`,
    });
  }

  // 3. Resolve Reconciler
  const reconciler = deps.reconcilerRegistry.resolve(job.channel, job.provider);
  if (!reconciler) {
    deps.logger.warn('reconcilePublicationWithProvider: no reconciler registered for channel/provider', {
      channel: job.channel,
      provider: job.provider,
    });
    const fallbackResult: ReconcileResult = {
      outcome: 'unresolved',
      unresolvedReason: 'NO_RECONCILER_REGISTERED',
    };
    return ok({ job, reconcileResult: fallbackResult });
  }

  let targetMetadata: Record<string, unknown> | null = null;
  if (deps.activationRepository) {
    const targetRes = await deps.activationRepository.findTargetById(job.targetId, input.organizationId);
    if (isOk(targetRes) && targetRes.value) {
      targetMetadata = (targetRes.value.metadata as Record<string, unknown>) || null;
    }
  }

  // 4. Execute Read-Only Provider Reconciliation
  const reconcileResultVal = await reconciler.reconcile({
    jobId: String(job.id),
    targetId: String(job.targetId),
    organizationId: input.organizationId,
    clientId: String(job.clientId),
    channel: job.channel,
    provider: job.provider,
    clientIntegrationId: job.clientIntegrationId ? String(job.clientIntegrationId) : null,
    attemptMetadata: (job.metadata as Record<string, unknown>) || null,
    targetMetadata,
  });

  if (!isOk(reconcileResultVal)) {
    deps.logger.error('reconcilePublicationWithProvider: reconciler port error', { error: reconcileResultVal });
    return err({ code: 'INTERNAL_ERROR', message: 'Failed executing provider reconciliation query' });
  }

  const reconcileResult = reconcileResultVal.value;

  // 5. Authoritative State Transition (via RPC reconcile_publication_job)
  if (reconcileResult.outcome === 'confirmed_published') {
    const updatedJobResult = await deps.publicationRepository.reconcileJob({
      jobId: job.id,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      outcome: 'published',
      externalId: reconcileResult.externalId || null,
      externalUrl: reconcileResult.externalUrl || null,
      note: input.note || 'Reconciled via provider query: confirmed published',
    });

    if (!isOk(updatedJobResult)) {
      return updatedJobResult;
    }
    return ok({ job: updatedJobResult.value, reconcileResult });
  }

  if (reconcileResult.outcome === 'confirmed_not_published') {
    const updatedJobResult = await deps.publicationRepository.reconcileJob({
      jobId: job.id,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      outcome: 'not_published',
      note: input.note || 'Reconciled via provider query: confirmed not published',
    });

    if (!isOk(updatedJobResult)) {
      return updatedJobResult;
    }
    return ok({ job: updatedJobResult.value, reconcileResult });
  }

  // 6. Unresolved -> No state change in DB, remains unknown_outcome
  return ok({ job, reconcileResult });
}
