/**
 * markActivationTargetReady — Phase 8A.2.
 *
 * Wrapper delgado sobre `CampaignActivationRepository.markTargetReady`
 * (RPC `mark_activation_target_ready`, preparing → ready). Rol mínimo:
 * operator+ (mismo criterio que `prepareActivationTarget` — ver ese
 * archivo para el detalle completo del patrón de defensa en profundidad).
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import { markActivationTargetReadySchema } from '@bop-agency/shared';
import type {
  CampaignActivationTarget,
  CampaignActivationTargetId,
  CampaignActivationRepository,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import { hasMinimumRole, insufficientRole, notOrganizationMember } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type MarkActivationTargetReadyInput = {
  readonly targetId: string;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
};

export type MarkActivationTargetReadyDeps = {
  activationRepository: CampaignActivationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function markActivationTargetReady(
  input: MarkActivationTargetReadyInput,
  deps: MarkActivationTargetReadyDeps,
): Promise<Result<CampaignActivationTarget>> {
  deps.logger.debug('markActivationTargetReady', {
    targetId: input.targetId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  const parsed = markActivationTargetReadySchema.safeParse({ targetId: input.targetId });
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
  if (!hasMinimumRole(memberResult.value.role, 'operator')) {
    return err(insufficientRole('operator', memberResult.value.role));
  }

  const result = await deps.activationRepository.markTargetReady(
    parsed.data.targetId as CampaignActivationTargetId,
    input.organizationId,
    input.actorUserId,
  );
  if (!isOk(result)) {
    deps.logger.error('markActivationTargetReady: repository error', { error: result });
    return result;
  }

  deps.logger.info('markActivationTargetReady: ok', {
    targetId: String(result.value.id),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  return ok(result.value);
}
