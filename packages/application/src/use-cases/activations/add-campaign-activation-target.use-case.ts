/**
 * addCampaignActivationTarget — Phase 8A.2.
 *
 * Crea un canal de distribución (target) bajo una activation NO-terminal
 * existente. El canal `manual` es de primera clase (audit §8) — ninguna
 * validación de este use case, ni de la migración, distingue "manual" como
 * un caso especial de segunda clase.
 *
 * Defensa en profundidad (matriz de roles §2 del kickoff — "strategist: may
 * add targets"; el operator NO puede agregar targets, solo operarlos una
 * vez creados):
 * 1. Rol mínimo strategist+.
 * 2. Se carga la activation real (aislada por organización) y se verifica
 *    que NO esté en estado terminal — el trigger de BD además reforzará la
 *    invariante `check_activation_target_match` (organization_id/client_id
 *    de la activation, y de `client_integrations` si aplica) dentro de la
 *    misma transacción.
 * 3. `validateCreateActivationTargetInput` (dominio, función pura) verifica
 *    ANTES de llamar al repositorio: el par channel/provider es válido
 *    (nunca un string arbitrario — `ACTIVATION_CHANNEL_PROVIDER` en
 *    `@bop-agency/shared` fija la relación), y que `clientIntegrationId`
 *    esté presente si y solo si el canal no es `manual`.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import { addCampaignActivationTargetSchema } from '@bop-agency/shared';
import type {
  CampaignActivationTarget,
  CampaignActivationId,
  CampaignActivationRepository,
  ClientIntegrationId,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import {
  hasMinimumRole,
  insufficientRole,
  notOrganizationMember,
  isActivationStatusTerminal,
  activationInvalidStatus,
  validateCreateActivationTargetInput,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type AddCampaignActivationTargetInput = {
  readonly activationId: string;
  readonly channel: string;
  readonly provider: string;
  readonly placement?: string | null;
  readonly clientIntegrationId?: string | null;
  readonly metadata?: Record<string, unknown>;
  /** SIEMPRE resuelto en el servidor desde la sesión — nunca del cliente. */
  readonly organizationId: OrganizationId;
  /** Actor autenticado — obtenido de la sesión del servidor, nunca del cliente. */
  readonly actorUserId: string;
};

export type AddCampaignActivationTargetDeps = {
  activationRepository: CampaignActivationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function addCampaignActivationTarget(
  input: AddCampaignActivationTargetInput,
  deps: AddCampaignActivationTargetDeps,
): Promise<Result<CampaignActivationTarget>> {
  deps.logger.debug('addCampaignActivationTarget', {
    activationId: input.activationId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  const parsed = addCampaignActivationTargetSchema.safeParse({
    activationId: input.activationId,
    channel: input.channel,
    provider: input.provider,
    placement: input.placement,
    clientIntegrationId: input.clientIntegrationId,
    metadata: input.metadata,
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

  const activationResult = await deps.activationRepository.findById(
    parsed.data.activationId as CampaignActivationId,
    input.organizationId,
  );
  if (!isOk(activationResult)) {
    return activationResult;
  }
  const activation = activationResult.value;

  if (isActivationStatusTerminal(activation.status)) {
    return err(activationInvalidStatus(activation.status, 'preparing'));
  }

  const clientIntegrationId = (parsed.data.clientIntegrationId ?? null) as ClientIntegrationId | null;

  const validationError = validateCreateActivationTargetInput({
    channel: parsed.data.channel,
    provider: parsed.data.provider,
    clientIntegrationId,
  });
  if (validationError) {
    return err({ code: 'VALIDATION_ERROR' as const, message: validationError });
  }

  const result = await deps.activationRepository.addTarget({
    activationId: activation.id,
    organizationId: input.organizationId,
    clientId: activation.clientId,
    channel: parsed.data.channel,
    provider: parsed.data.provider,
    placement: parsed.data.placement ?? null,
    clientIntegrationId,
    metadata: parsed.data.metadata ?? {},
  });
  if (!isOk(result)) {
    deps.logger.error('addCampaignActivationTarget: repository error', { error: result });
    return result;
  }

  deps.logger.info('addCampaignActivationTarget: ok', {
    targetId: String(result.value.id),
    activationId: String(activation.id),
    organizationId: input.organizationId,
  });

  return ok(result.value);
}
