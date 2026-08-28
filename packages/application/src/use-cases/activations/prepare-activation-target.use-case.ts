/**
 * prepareActivationTarget — Phase 8A.2.
 *
 * Wrapper delgado sobre `CampaignActivationRepository.prepareTarget`, que
 * llama exclusivamente a la RPC SECURITY DEFINER `prepare_activation_target`
 * (pending → preparing). La RPC es la autoridad final (vuelve a verificar
 * rol y status dentro de la misma transacción); este use case verifica lo
 * mismo ANTES de llamarla para fallar rápido con errores tipados.
 *
 * Matriz de roles §2 del kickoff: "operator: may operate manual targets;
 * may prepare/mark ready/mark published where allowed" — operator+
 * (coincide exactamente con el guard de la RPC: "actor lacks operator+
 * role").
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import { prepareActivationTargetSchema } from '@bop-agency/shared';
import type {
  CampaignActivationTarget,
  CampaignActivationTargetId,
  CampaignActivationRepository,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import { hasMinimumRole, insufficientRole, notOrganizationMember } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type PrepareActivationTargetInput = {
  readonly targetId: string;
  readonly checklist?: Record<string, unknown> | null;
  /** SIEMPRE resuelto en el servidor desde la sesión — nunca del cliente. */
  readonly organizationId: OrganizationId;
  /** Actor autenticado — obtenido de la sesión del servidor, nunca del cliente. */
  readonly actorUserId: string;
};

export type PrepareActivationTargetDeps = {
  activationRepository: CampaignActivationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function prepareActivationTarget(
  input: PrepareActivationTargetInput,
  deps: PrepareActivationTargetDeps,
): Promise<Result<CampaignActivationTarget>> {
  deps.logger.debug('prepareActivationTarget', {
    targetId: input.targetId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  const parsed = prepareActivationTargetSchema.safeParse({
    targetId: input.targetId,
    checklist: input.checklist,
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
  if (!hasMinimumRole(memberResult.value.role, 'operator')) {
    return err(insufficientRole('operator', memberResult.value.role));
  }

  const result = await deps.activationRepository.prepareTarget(
    parsed.data.targetId as CampaignActivationTargetId,
    input.organizationId,
    input.actorUserId,
    parsed.data.checklist ?? null,
  );
  if (!isOk(result)) {
    deps.logger.error('prepareActivationTarget: repository error', { error: result });
    return result;
  }

  deps.logger.info('prepareActivationTarget: ok', {
    targetId: String(result.value.id),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  return ok(result.value);
}
