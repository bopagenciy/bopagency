/**
 * markActivationTargetPublished — Phase 8A.2.
 *
 * Wrapper delgado sobre `CampaignActivationRepository.markTargetPublished`
 * (RPC `mark_activation_target_published`, ready|scheduled → published —
 * el camino manual de primera clase, audit §8). Rol mínimo: operator+
 * (mismo criterio que `prepareActivationTarget`).
 *
 * NUNCA publica en ningún proveedor externo: este use case únicamente
 * registra que el operador YA publicó manualmente en la plataforma real y
 * lo deja constar (con `externalReference`/`note` opcionales, nunca una
 * credencial — ver R-ACT-05).
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import { markActivationTargetPublishedSchema } from '@bop-agency/shared';
import type {
  CampaignActivationTarget,
  CampaignActivationTargetId,
  CampaignActivationRepository,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import { hasMinimumRole, insufficientRole, notOrganizationMember } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type MarkActivationTargetPublishedInput = {
  readonly targetId: string;
  readonly externalReference?: string | null;
  readonly note?: string | null;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
};

export type MarkActivationTargetPublishedDeps = {
  activationRepository: CampaignActivationRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function markActivationTargetPublished(
  input: MarkActivationTargetPublishedInput,
  deps: MarkActivationTargetPublishedDeps,
): Promise<Result<CampaignActivationTarget>> {
  deps.logger.debug('markActivationTargetPublished', {
    targetId: input.targetId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  const parsed = markActivationTargetPublishedSchema.safeParse({
    targetId: input.targetId,
    externalReference: input.externalReference,
    note: input.note,
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

  const refClean = parsed.data.externalReference?.trim();
  const noteClean = parsed.data.note?.trim();
  if (!refClean && !noteClean) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: 'Se requiere al menos un campo de evidencia (referencia externa o nota explicativa)',
    });
  }

  const result = await deps.activationRepository.markTargetPublished(
    parsed.data.targetId as CampaignActivationTargetId,
    input.organizationId,
    input.actorUserId,
    parsed.data.externalReference ?? null,
    parsed.data.note ?? null,
  );
  if (!isOk(result)) {
    deps.logger.error('markActivationTargetPublished: repository error', { error: result });
    return result;
  }

  deps.logger.info('markActivationTargetPublished: ok', {
    targetId: String(result.value.id),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  return ok(result.value);
}
