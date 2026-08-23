/**
 * rejectCampaign — Phase 7C. Automation hook — Phase 7F.
 *
 * Transición review → rejected. Mismo diseño que approveCampaign — delega
 * la escritura a `CampaignRepository.reject`, que llama exclusivamente a la
 * RPC SECURITY DEFINER `reject_campaign` (nunca UPDATE directo). Además de
 * los mismos chequeos de approveCampaign, valida que `note` no esté vacía
 * (regla de negocio fijada #7) en TRES capas independientes: aquí
 * (isValidRejectionNote, domain), en el Zod schema (rejectCampaignSchema,
 * que ya corrió justo antes), y finalmente en BD (CHECK
 * ck_campaign_approvals_rejection_note + validación explícita dentro de la
 * RPC) — ninguna capa confía únicamente en la anterior.
 *
 * Phase 7F: POST-COMMIT, best-effort, dispara
 * `evaluateCampaignAutomation('campaign_rejected')` — crea una tarea interna
 * ("Campaña rechazada: <name>") con la nota de rechazo, para el
 * creador/editor responsable si el modelo de tareas lo permitiera; hoy
 * `Task` no tiene columna `assignee_id` (ver domain/entities/task.ts), así
 * que la tarea queda org-scoped sin asignación explícita — visible a
 * owner/admin/strategist/operator vía RLS existente de `tasks`, igual que
 * cualquier otra tarea operativa (no se inventa un mecanismo de asignación
 * nuevo). Un fallo de este paso NUNCA revierte el rechazo ya confirmado.
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
  isValidRejectionNote,
  rejectionNoteRequired,
} from '@bop-agency/domain';
import { rejectCampaignSchema } from '@bop-agency/shared';
import type { LoggerPort } from '../../ports/logger.port';
import { evalCampaignAutomationSilently } from './campaign-automation-dispatch';

export type RejectCampaignInput = {
  readonly campaignId: string;
  readonly note: string;
  /** SIEMPRE resuelto en el servidor desde la sesión — nunca del cliente. */
  readonly organizationId: OrganizationId;
  /** Actor autenticado — obtenido de la sesión del servidor, nunca del cliente. */
  readonly actorUserId: string;
};

export type RejectCampaignDeps = {
  campaignRepository: CampaignRepository;
  organizationRepository: OrganizationRepository;
  /** Phase 7F — opcional para no romper callers/tests preexistentes que no lo pasen. */
  alertRepository?: AlertRepository;
  taskRepository?: TaskRepository;
  logger: LoggerPort;
};

export async function rejectCampaign(
  input: RejectCampaignInput,
  deps: RejectCampaignDeps,
): Promise<Result<Campaign>> {
  deps.logger.debug('rejectCampaign', {
    campaignId: input.campaignId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  const parsed = rejectCampaignSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
  }
  const campaignId = parsed.data.campaignId as CampaignId;
  const note = parsed.data.note;

  // Defensa adicional en dominio, redundante con el Zod .min(1) tras trim()
  // — nunca confiar en una sola capa para la regla de negocio #7.
  if (!isValidRejectionNote(note)) {
    return err(rejectionNoteRequired());
  }

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
  if (!canTransitionCampaign(campaignResult.value.status, 'rejected')) {
    return err(campaignInvalidStatus(campaignResult.value.status, 'rejected'));
  }

  // 4. Rechazar vía RPC (reject_campaign) — actualiza campaigns e inserta
  //    campaign_approvals de forma atómica.
  const result = await deps.campaignRepository.reject(
    campaignId,
    input.organizationId,
    input.actorUserId,
    note,
  );
  if (!isOk(result)) {
    deps.logger.error('rejectCampaign: repository error', { error: result });
    return result;
  }

  deps.logger.info('rejectCampaign: ok', {
    campaignId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  // 5. Phase 7F — side effect interno, post-commit, best-effort.
  await evalCampaignAutomationSilently(
    {
      organizationId: input.organizationId,
      campaignId,
      campaignName: result.value.name,
      clientId: result.value.clientId,
      actorUserId: input.actorUserId,
      automationType: 'campaign_rejected',
      rejectionNote: note,
      occurredAt: new Date(),
    },
    deps,
  );

  return ok(result.value);
}
