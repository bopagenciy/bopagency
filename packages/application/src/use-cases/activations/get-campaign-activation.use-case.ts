/**
 * getCampaignActivation — Phase 8A.2.
 *
 * Lectura pura de una activation por id, aislada por organización. Solo
 * requiere membresía (cualquier rol, incluido viewer — matriz de roles §2:
 * "viewer: read only"). NUNCA muta tasks/alerts — ninguna lectura de 8A.2
 * invoca `activation-signals.ts`.
 */

import { isOk, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  CampaignActivation,
  CampaignActivationId,
  CampaignActivationRepository,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import { notOrganizationMember } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type GetCampaignActivationInput = {
  readonly activationId: string;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
};

export type GetCampaignActivationDeps = {
  activationRepository: CampaignActivationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function getCampaignActivation(
  input: GetCampaignActivationInput,
  deps: GetCampaignActivationDeps,
): Promise<Result<CampaignActivation>> {
  deps.logger.debug('getCampaignActivation', {
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

  return deps.activationRepository.findById(
    input.activationId as CampaignActivationId,
    input.organizationId,
  );
}
