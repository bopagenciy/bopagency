/**
 * cancelCampaignActivation — Phase 8A.2.
 *
 * Wrapper delgado sobre `CampaignActivationRepository.cancel` (RPC
 * `cancel_campaign_activation`, cascada a targets no-terminales). Rol
 * mínimo: strategist+ — coincide exactamente con el guard real de la RPC
 * ("cancel_campaign_activation: actor lacks strategist+ role", verificado
 * en runtime Phase 8A.1 Round B–E) y con la matriz de roles §2 del kickoff
 * ("strategist: may cancel activation while state permits"; "operator:
 * cannot cancel activation").
 *
 * No dispara ninguna señal — ver la nota de alcance en
 * `activation-signals.ts`.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import { cancelCampaignActivationSchema } from '@bop-agency/shared';
import type {
  CampaignActivation,
  CampaignActivationId,
  CampaignActivationRepository,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import { hasMinimumRole, insufficientRole, notOrganizationMember } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type CancelCampaignActivationInput = {
  readonly activationId: string;
  readonly reason: string;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
};

export type CancelCampaignActivationDeps = {
  activationRepository: CampaignActivationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function cancelCampaignActivation(
  input: CancelCampaignActivationInput,
  deps: CancelCampaignActivationDeps,
): Promise<Result<CampaignActivation>> {
  deps.logger.debug('cancelCampaignActivation', {
    activationId: input.activationId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  const parsed = cancelCampaignActivationSchema.safeParse({
    activationId: input.activationId,
    reason: input.reason,
  });
  if (!parsed.success) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
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

  const result = await deps.activationRepository.cancel(
    parsed.data.activationId as CampaignActivationId,
    input.organizationId,
    input.actorUserId,
    parsed.data.reason,
  );
  if (!isOk(result)) {
    deps.logger.error('cancelCampaignActivation: repository error', { error: result });
    return result;
  }

  deps.logger.info('cancelCampaignActivation: ok', {
    activationId: String(result.value.id),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  return ok(result.value);
}
