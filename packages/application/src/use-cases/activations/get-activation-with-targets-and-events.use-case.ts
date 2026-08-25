/**
 * getActivationWithTargetsAndEvents — Phase 8A.2.
 *
 * Lectura agregada pura: activation + targets (via
 * `findByIdWithTargets`) + página del log de eventos (via `listEvents`).
 * Pensada para la futura vista de detalle de activation en UI (fuera de
 * alcance de 8A.2, pero el read use case se agrega ahora per kickoff §4).
 *
 * Solo requiere membresía (cualquier rol). NUNCA muta tasks/alerts.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  CampaignActivationEvent,
  CampaignActivationId,
  CampaignActivationRepository,
  CampaignActivationWithTargets,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import { notOrganizationMember } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type GetActivationWithTargetsAndEventsInput = {
  readonly activationId: CampaignActivationId;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
  readonly eventsPagination: PaginationParams;
};

export type GetActivationWithTargetsAndEventsDeps = {
  activationRepository: CampaignActivationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export type ActivationWithTargetsAndEvents = {
  readonly activation: CampaignActivationWithTargets;
  readonly events: PaginatedResult<CampaignActivationEvent>;
};

export async function getActivationWithTargetsAndEvents(
  input: GetActivationWithTargetsAndEventsInput,
  deps: GetActivationWithTargetsAndEventsDeps,
): Promise<Result<ActivationWithTargetsAndEvents>> {
  deps.logger.debug('getActivationWithTargetsAndEvents', {
    activationId: input.activationId,
    organizationId: input.organizationId,
  });

  const memberResult = await deps.organizationRepository.findMember(
    input.organizationId,
    input.actorUserId,
  );
  if (!isOk(memberResult)) {
    return err(notOrganizationMember());
  }

  const activationResult = await deps.activationRepository.findByIdWithTargets(
    input.activationId,
    input.organizationId,
  );
  if (!isOk(activationResult)) {
    return activationResult;
  }

  const events = await deps.activationRepository.listEvents(
    input.activationId,
    input.organizationId,
    input.eventsPagination,
  );

  return ok({
    activation: activationResult.value,
    events,
  });
}
