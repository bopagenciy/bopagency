/**
 * cancelActivationTarget — Phase 8A.2.
 *
 * Wrapper delgado sobre `CampaignActivationRepository.cancelTarget` (RPC
 * `cancel_activation_target`). Rol mínimo: strategist+ — coincide
 * exactamente con el guard real de la RPC ("cancel_activation_target:
 * actor lacks strategist+ role", verificado en runtime Phase 8A.1 Round
 * B–E). El operator puede OPERAR un target (prepare/ready/published) pero
 * NO cancelarlo — matriz de roles §2 del kickoff.
 *
 * No dispara ninguna señal (alerta/tarea) — ver la nota explícita de
 * alcance en `activation-signals.ts`: una cancelación es una acción
 * intencional y ya auditada (razón obligatoria + actor + evento en
 * `campaign_activation_events`), no un incidente.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import { cancelActivationTargetSchema } from '@bop-agency/shared';
import type {
  CampaignActivationTarget,
  CampaignActivationTargetId,
  CampaignActivationRepository,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import { hasMinimumRole, insufficientRole, notOrganizationMember } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type CancelActivationTargetInput = {
  readonly targetId: string;
  readonly reason: string;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
};

export type CancelActivationTargetDeps = {
  activationRepository: CampaignActivationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function cancelActivationTarget(
  input: CancelActivationTargetInput,
  deps: CancelActivationTargetDeps,
): Promise<Result<CampaignActivationTarget>> {
  deps.logger.debug('cancelActivationTarget', {
    targetId: input.targetId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  const parsed = cancelActivationTargetSchema.safeParse({
    targetId: input.targetId,
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

  const result = await deps.activationRepository.cancelTarget(
    parsed.data.targetId as CampaignActivationTargetId,
    input.organizationId,
    input.actorUserId,
    parsed.data.reason,
  );
  if (!isOk(result)) {
    deps.logger.error('cancelActivationTarget: repository error', { error: result });
    return result;
  }

  deps.logger.info('cancelActivationTarget: ok', {
    targetId: String(result.value.id),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  return ok(result.value);
}
