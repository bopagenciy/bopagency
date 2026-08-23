/**
 * submitCampaignForReview — Phase 7C. Automation hook — Phase 7F.
 *
 * Transición draft → review. NO usa una RPC: la policy `campaigns_update`
 * (Phase 7B) ya permite que un UPDATE genérico fije el nuevo status a
 * 'review' mientras el actual sea 'draft' — la instrucción explícita de
 * esta tarea es no crear una RPC si no hace falta, y aquí no hace falta
 * (a diferencia de approve/reject, esta transición no requiere escribir
 * `campaign_approvals` ni ninguna decisión de autorización adicional más
 * allá de "cualquiera con permiso de editar puede enviar a revisión").
 *
 * Flujo:
 * 1. Valida input con Zod (submitCampaignForReviewSchema).
 * 2. Verifica que el actor sea miembro de la organización con rol
 *    operator+ (matriz de permisos aprobada: owner/admin/strategist/
 *    operator sí, viewer no).
 * 3. Carga la campaña (aísla automáticamente por organización — cubre
 *    tanto "campaña inexistente" como "campaña de otra organización" con
 *    el mismo NOT_FOUND, igual que el resto de repositorios del proyecto).
 * 4. Verifica la transición con `canTransitionCampaign` (solo draft → review
 *    es válida; cualquier otro status actual retorna VALIDATION_ERROR).
 * 5. Persiste vía CampaignRepository.update (setea submitted_for_review_at
 *    automáticamente — ver SupabaseCampaignRepository.update).
 * 6. NO toca approved_at/rejected_at. NO crea campaign_approvals todavía.
 * 7. Phase 7F — POST-COMMIT, best-effort: dispara
 *    `evaluateCampaignAutomation('campaign_review_requested')`, que crea una
 *    tarea operativa para owner/admin ("Revisar campaña: <name>"),
 *    deduplicada por firma. Un fallo aquí NUNCA revierte ni afecta el
 *    resultado de la transición ya persistida (ver
 *    `evalCampaignAutomationSilently`).
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  AlertRepository,
  Campaign,
  CampaignId,
  CampaignRepository,
  OrganizationRepository,
  TaskRepository,
} from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import {
  canTransitionCampaign,
  campaignInvalidStatus,
  hasMinimumRole,
  insufficientRole,
  notOrganizationMember,
} from '@bop-agency/domain';
import { submitCampaignForReviewSchema } from '@bop-agency/shared';
import type { LoggerPort } from '../../ports/logger.port';
import { evalCampaignAutomationSilently } from './campaign-automation-dispatch';

export type SubmitCampaignForReviewInput = {
  readonly campaignId: string;
  /** SIEMPRE resuelto en el servidor desde la sesión — nunca del cliente. */
  readonly organizationId: OrganizationId;
  /** Actor autenticado — obtenido de la sesión del servidor, nunca del cliente. */
  readonly actorUserId: string;
};

export type SubmitCampaignForReviewDeps = {
  campaignRepository: CampaignRepository;
  organizationRepository: OrganizationRepository;
  /** Phase 7F — opcional para no romper callers/tests preexistentes que no lo pasen. */
  alertRepository?: AlertRepository;
  taskRepository?: TaskRepository;
  logger: LoggerPort;
};

export async function submitCampaignForReview(
  input: SubmitCampaignForReviewInput,
  deps: SubmitCampaignForReviewDeps,
): Promise<Result<Campaign>> {
  deps.logger.debug('submitCampaignForReview', {
    campaignId: input.campaignId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  const parsed = submitCampaignForReviewSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
  }
  const campaignId = parsed.data.campaignId as CampaignId;

  // 1. Verificar membresía y rol mínimo (operator+; viewer denegado).
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

  // 2. Cargar la campaña (aísla por organización — cubre inexistente y otra org).
  const campaignResult = await deps.campaignRepository.findById(campaignId, input.organizationId);
  if (!isOk(campaignResult)) {
    return campaignResult;
  }
  const campaign = campaignResult.value;

  // 3. Verificar la transición de dominio.
  if (!canTransitionCampaign(campaign.status, 'review')) {
    return err(campaignInvalidStatus(campaign.status, 'review'));
  }

  // 4. Persistir (setea submitted_for_review_at automáticamente).
  const updateResult = await deps.campaignRepository.update(campaignId, input.organizationId, {
    status: 'review',
    updatedBy: input.actorUserId,
  });
  if (!isOk(updateResult)) {
    deps.logger.error('submitCampaignForReview: repository error', { error: updateResult });
    return updateResult;
  }

  deps.logger.info('submitCampaignForReview: ok', {
    campaignId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  // 5. Phase 7F — side effect interno, post-commit, best-effort. El status ya
  //    quedó confirmado arriba; esto NUNCA lo revierte.
  await evalCampaignAutomationSilently(
    {
      organizationId: input.organizationId,
      campaignId,
      campaignName: updateResult.value.name,
      clientId: updateResult.value.clientId,
      actorUserId: input.actorUserId,
      automationType: 'campaign_review_requested',
      occurredAt: new Date(),
    },
    deps,
  );

  return ok(updateResult.value);
}
