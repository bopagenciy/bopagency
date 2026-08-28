/**
 * cancelPublicationJob — Phase 8B.2.
 *
 * Wrapper sobre `CampaignPublicationRepository.cancelJob` (RPC
 * `cancel_publication_job`). A diferencia del resto de wrappers de 8A.2/
 * 8B.2 (rol fijo), el rol mínimo requerido AQUÍ depende del estado actual
 * del job — matriz exacta ya bloqueada en 8B.0/8B.1:
 *
 *   queued / claimed  -> operator+  (`canDirectlyCancelPublicationJob`)
 *   in_progress       -> strategist+ (`canRequestCooperativeCancel`, cooperativo — NO transiciona el estado)
 *   unknown_outcome / terminal -> rechazado explícitamente (requiere reconciliación, nunca cancelación)
 *
 * Por eso este use case SÍ lee el job antes de decidir el rol mínimo —
 * a diferencia de `cancelActivationTarget` (rol fijo strategist+, no
 * depende de estado). La RPC re-valida todo de forma authoritativa de
 * todos modos (defensa en profundidad, mismo criterio que el resto de
 * `application`) — esta lectura previa es solo para dar un error claro y
 * específico ANTES de intentar la RPC, no reemplaza su guard.
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
import {
  hasMinimumRole,
  insufficientRole,
  notOrganizationMember,
  canDirectlyCancelPublicationJob,
  canRequestCooperativeCancel,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type CancelPublicationJobInput = {
  readonly jobId: string;
  readonly reason: string;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
};

export type CancelPublicationJobDeps = {
  publicationRepository: CampaignPublicationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function cancelPublicationJob(
  input: CancelPublicationJobInput,
  deps: CancelPublicationJobDeps,
): Promise<Result<CampaignPublicationJob>> {
  deps.logger.debug('cancelPublicationJob', {
    jobId: input.jobId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  if (!input.reason || input.reason.trim().length === 0) {
    return err({ code: 'VALIDATION_ERROR' as const, message: 'reason es requerido' });
  }

  const memberResult = await deps.organizationRepository.findMember(
    input.organizationId,
    input.actorUserId,
  );
  if (!isOk(memberResult)) {
    return err(notOrganizationMember());
  }

  const jobResult = await deps.publicationRepository.findJobById(
    input.jobId as CampaignPublicationJobId,
    input.organizationId,
  );
  if (!isOk(jobResult)) {
    return jobResult;
  }
  const job = jobResult.value;

  let requiredRole: 'operator' | 'strategist';
  if (canDirectlyCancelPublicationJob(job.status)) {
    requiredRole = 'operator';
  } else if (canRequestCooperativeCancel(job.status)) {
    requiredRole = 'strategist';
  } else {
    // unknown_outcome o terminal — nunca cancelable, requiere reconciliación
    // explícita (unknown_outcome) o ya está cerrado (terminal).
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: `El job ${input.jobId} no puede cancelarse en estado '${job.status}' — ` +
        (job.status === 'unknown_outcome'
          ? 'requiere reconciliación explícita, nunca cancelación.'
          : 'ya está en un estado terminal.'),
    });
  }

  if (!hasMinimumRole(memberResult.value.role, requiredRole)) {
    return err(insufficientRole(requiredRole, memberResult.value.role));
  }

  const result = await deps.publicationRepository.cancelJob(
    input.jobId as CampaignPublicationJobId,
    input.organizationId,
    input.actorUserId,
    input.reason,
  );
  if (!isOk(result)) {
    deps.logger.error('cancelPublicationJob: repository error', { error: result });
    return result;
  }

  deps.logger.info('cancelPublicationJob: ok', {
    jobId: String(result.value.id),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  return ok(result.value);
}
