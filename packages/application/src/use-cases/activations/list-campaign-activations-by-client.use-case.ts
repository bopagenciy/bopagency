/**
 * listCampaignActivationsByClient — Phase 8A.2.
 *
 * Lectura pura y paginada de las activations de un cliente dentro de una
 * organización (`CampaignActivationFilter.clientId`), agregando además
 * status opcional. Solo requiere membresía (cualquier rol). NUNCA muta
 * tasks/alerts.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { ActivationStatus, Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  CampaignActivation,
  CampaignActivationRepository,
  OrganizationRepository,
  OrganizationId,
  ClientId,
} from '@bop-agency/domain';
import { notOrganizationMember } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type ListCampaignActivationsByClientInput = {
  readonly clientId: ClientId;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
  readonly status?: ActivationStatus;
  readonly pagination: PaginationParams;
};

export type ListCampaignActivationsByClientDeps = {
  activationRepository: CampaignActivationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function listCampaignActivationsByClient(
  input: ListCampaignActivationsByClientInput,
  deps: ListCampaignActivationsByClientDeps,
): Promise<Result<PaginatedResult<CampaignActivation>>> {
  deps.logger.debug('listCampaignActivationsByClient', {
    clientId: input.clientId,
    organizationId: input.organizationId,
  });

  const memberResult = await deps.organizationRepository.findMember(
    input.organizationId,
    input.actorUserId,
  );
  if (!isOk(memberResult)) {
    return err(notOrganizationMember());
  }

  const result = await deps.activationRepository.findByOrganization(
    {
      organizationId: input.organizationId,
      clientId: input.clientId,
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
    input.pagination,
  );
  return ok(result);
}
