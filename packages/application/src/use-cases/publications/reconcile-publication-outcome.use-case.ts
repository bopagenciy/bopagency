/**
 * reconcilePublicationOutcome — Phase 8B.2.
 *
 * Wrapper sobre `CampaignPublicationRepository.reconcileJob` (RPC
 * `reconcile_publication_job`, rol strategist+ ÚNICAMENTE — locked
 * decision #1 de 8B.0). `unknown_outcome -> succeeded | failed`. Nunca
 * aplica a ningún otro estado (`canReconcilePublicationJob`) — la RPC lo
 * valida authoritativamente, este wrapper solo agrega el mismo chequeo de
 * rol en profundidad que el resto de `application`.
 *
 * Este es el ÚNICO camino de salida permitido para un job en
 * `unknown_outcome` (ver "UNKNOWN_OUTCOME SAFETY" en el kickoff de 8B.2)
 * — nunca un retry ciego, nunca un auto-failure.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  CampaignPublicationJob,
  CampaignPublicationJobId,
  CampaignPublicationRepository,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import { hasMinimumRole, insufficientRole, notOrganizationMember } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type ReconcilePublicationOutcomeInput = {
  readonly jobId: string;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
  readonly outcome: 'published' | 'not_published';
  readonly externalId?: string | null;
  readonly externalUrl?: string | null;
  readonly note: string;
};

export type ReconcilePublicationOutcomeDeps = {
  publicationRepository: CampaignPublicationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function reconcilePublicationOutcome(
  input: ReconcilePublicationOutcomeInput,
  deps: ReconcilePublicationOutcomeDeps,
): Promise<Result<CampaignPublicationJob>> {
  deps.logger.debug('reconcilePublicationOutcome', {
    jobId: input.jobId,
    organizationId: input.organizationId,
    outcome: input.outcome,
  });

  if (!input.note || input.note.trim().length === 0) {
    return err({ code: 'VALIDATION_ERROR' as const, message: 'note es requerido para reconciliar' });
  }

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

  const result = await deps.publicationRepository.reconcileJob({
    jobId: input.jobId as CampaignPublicationJobId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    outcome: input.outcome,
    externalId: input.externalId ?? null,
    externalUrl: input.externalUrl ?? null,
    note: input.note,
  });

  if (!isOk(result)) {
    deps.logger.error('reconcilePublicationOutcome: repository error', { error: result });
    return result;
  }

  deps.logger.info('reconcilePublicationOutcome: ok', {
    jobId: String(result.value.id),
    outcome: input.outcome,
    organizationId: input.organizationId,
  });

  return ok(result.value);
}
