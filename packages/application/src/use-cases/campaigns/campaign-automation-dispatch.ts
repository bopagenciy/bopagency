/**
 * campaign-automation-dispatch.ts — Phase 7F.
 *
 * Helper compartido "best-effort" para invocar `evaluateCampaignAutomation`
 * desde los use cases de campaña (submit/approve/reject/generate-with-ai/
 * regenerate) SIN que un fallo del side effect interno afecte el resultado
 * de la operación principal ya confirmada. Espejo exacto de
 * `evalIncidentSilently` (Phase 6F, `start-execution.use-case.ts`).
 *
 * CONSISTENCIA (§5/§15 de la especificación):
 * - El status de campaña es la fuente de verdad y ya fue persistido por el
 *   caller ANTES de invocar este helper.
 * - Si `evaluateCampaignAutomation` falla (Result de error) o lanza una
 *   excepción inesperada, se loguea como warning (observable) y se
 *   continúa — nunca se propaga al caller, nunca se revierte el commit.
 * - alertRepository/taskRepository son OPCIONALES en los Deps de cada use
 *   case para no romper compatibilidad con callers/tests que no los
 *   inyecten; si faltan, este helper es un no-op explícito (logueado),
 *   no un fallo silencioso indetectable.
 */

import type { AlertRepository, TaskRepository, CampaignId, OrganizationId, ClientId } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';
import { evaluateCampaignAutomation } from './evaluate-campaign-automation.use-case';
import type { CampaignAutomationType } from './campaign-automation-types';

export type CampaignAutomationDispatchDeps = {
  alertRepository?: AlertRepository;
  taskRepository?: TaskRepository;
  logger: LoggerPort;
};

export type CampaignAutomationDispatchInput = {
  readonly organizationId: OrganizationId;
  readonly campaignId: CampaignId | null;
  readonly campaignName: string;
  readonly clientId: ClientId | null;
  /**
   * UUID real del actor autenticado — server-side, NUNCA inventado. Ver el
   * comentario extenso en `EvaluateCampaignAutomationInput.actorUserId`
   * (mismo campo, mismo requisito — corrige el bug de smoke donde se usaba
   * un string literal no-UUID como `created_by`).
   */
  readonly actorUserId: string;
  readonly automationType: CampaignAutomationType;
  readonly rejectionNote?: string | null;
  readonly aiErrorKind?: string | null;
  readonly safeErrorMessage?: string | null;
  readonly occurredAt: Date;
};

export async function evalCampaignAutomationSilently(
  input: CampaignAutomationDispatchInput,
  deps: CampaignAutomationDispatchDeps,
): Promise<void> {
  const { alertRepository, taskRepository, logger } = deps;

  if (!alertRepository || !taskRepository) {
    logger.warn('evalCampaignAutomationSilently: skipped — alertRepository/taskRepository not wired', {
      organizationId: input.organizationId,
      campaignId: input.campaignId ? String(input.campaignId) : null,
      automationType: input.automationType,
    });
    return;
  }

  try {
    const result = await evaluateCampaignAutomation(input, { alertRepository, taskRepository, logger });
    if (!result.success) {
      logger.warn('evalCampaignAutomationSilently: evaluation returned error (best-effort)', {
        organizationId: input.organizationId,
        campaignId: input.campaignId ? String(input.campaignId) : null,
        automationType: input.automationType,
        error: result.error.code,
      });
    }
  } catch (e) {
    logger.warn('evalCampaignAutomationSilently: threw unexpectedly (best-effort)', {
      organizationId: input.organizationId,
      campaignId: input.campaignId ? String(input.campaignId) : null,
      automationType: input.automationType,
      error: String(e),
    });
  }
}
