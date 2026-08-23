/**
 * approveCampaign — Phase 7C. Automation hook — Phase 7F.
 *
 * Transición review → approved. Delega la escritura a
 * `CampaignRepository.approve`, que a su vez llama exclusivamente a la RPC
 * SECURITY DEFINER `approve_campaign` (nunca UPDATE directo) — ver
 * 20260816140000_phase7c_campaign_approval_workflow.sql. La RPC es la
 * autoridad final (vuelve a verificar rol y status dentro de la misma
 * transacción que inserta `campaign_approvals`); este use case verifica lo
 * mismo ANTES de llamarla para fallar rápido con errores tipados y
 * amigables en vez de depender únicamente del texto de la excepción de
 * Postgres — mismo criterio de defensa en profundidad que
 * `createCampaignDraft` reverificando el cliente pese al trigger de BD.
 *
 * Flujo:
 * 1. Valida input con Zod (approveCampaignSchema).
 * 2. Verifica que el actor sea miembro de la organización con rol admin+
 *    (matriz de permisos aprobada: solo owner/admin pueden aprobar).
 * 3. Carga la campaña (aísla por organización).
 * 4. Verifica la transición con `canTransitionCampaign` (solo review →
 *    approved es válida).
 * 5. Llama a CampaignRepository.approve (RPC).
 * 6. Phase 7F — POST-COMMIT, best-effort: dispara
 *    `evaluateCampaignAutomation('campaign_approved')`, que crea una tarea
 *    interna "Preparar activación de campaña: <name>". REGLA CRÍTICA: esto
 *    NUNCA publica en ningún proveedor externo — solo señaliza que la
 *    campaña quedó lista para el siguiente paso manual/futuro. La RPC ya
 *    completó y confirmó la aprobación ANTES de que este paso se ejecute —
 *    un fallo aquí no revierte `approved_at` ni la fila en
 *    `campaign_approvals`.
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
import { approveCampaignSchema } from '@bop-agency/shared';
import type { LoggerPort } from '../../ports/logger.port';
import { evalCampaignAutomationSilently } from './campaign-automation-dispatch';

export type ApproveCampaignInput = {
  readonly campaignId: string;
  /** SIEMPRE resuelto en el servidor desde la sesión — nunca del cliente. */
  readonly organizationId: OrganizationId;
  /** Actor autenticado — obtenido de la sesión del servidor, nunca del cliente. */
  readonly actorUserId: string;
};

export type ApproveCampaignDeps = {
  campaignRepository: CampaignRepository;
  organizationRepository: OrganizationRepository;
  /** Phase 7F — opcional para no romper callers/tests preexistentes que no lo pasen. */
  alertRepository?: AlertRepository;
  taskRepository?: TaskRepository;
  logger: LoggerPort;
};

export async function approveCampaign(
  input: ApproveCampaignInput,
  deps: ApproveCampaignDeps,
): Promise<Result<Campaign>> {
  deps.logger.debug('approveCampaign', {
    campaignId: input.campaignId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  const parsed = approveCampaignSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
  }
  const campaignId = parsed.data.campaignId as CampaignId;

  // 1. Verificar membresía y rol mínimo (admin+; strategist/operator/viewer denegados).
  const memberResult = await deps.organizationRepository.findMember(
    input.organizationId,
    input.actorUserId,
  );
  if (!isOk(memberResult)) {
    return err(notOrganizationMember());
  }
  if (!hasMinimumRole(memberResult.value.role, 'admin')) {
    return err(insufficientRole('admin', memberResult.value.role));
  }

  // 2. Cargar la campaña (aísla por organización).
  const campaignResult = await deps.campaignRepository.findById(campaignId, input.organizationId);
  if (!isOk(campaignResult)) {
    return campaignResult;
  }

  // 3. Verificar la transición de dominio.
  if (!canTransitionCampaign(campaignResult.value.status, 'approved')) {
    return err(campaignInvalidStatus(campaignResult.value.status, 'approved'));
  }

  // 4. Aprobar vía RPC (approve_campaign) — actualiza campaigns e inserta
  //    campaign_approvals de forma atómica.
  const result = await deps.campaignRepository.approve(campaignId, input.organizationId, input.actorUserId);
  if (!isOk(result)) {
    deps.logger.error('approveCampaign: repository error', { error: result });
    return result;
  }

  deps.logger.info('approveCampaign: ok', {
    campaignId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  // 5. Phase 7F — side effect interno, post-commit, best-effort. NO publica
  //    externamente — solo crea una tarea de preparación interna.
  await evalCampaignAutomationSilently(
    {
      organizationId: input.organizationId,
      campaignId,
      campaignName: result.value.name,
      clientId: result.value.clientId,
      actorUserId: input.actorUserId,
      automationType: 'campaign_approved',
      occurredAt: new Date(),
    },
    deps,
  );

  return ok(result.value);
}
