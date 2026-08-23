/**
 * evaluateCampaignAutomation — Phase 7F.
 *
 * Evaluador determinístico de side effects internos de Campaign Studio.
 * Espejo directo de `evaluateAutomationIncident` (Phase 6F): NO se
 * construye un runtime nuevo, se reutiliza exactamente la misma
 * infraestructura (AlertRepository.upsertByAlertKey, TaskRepository.create
 * + findActiveBySignatureTag) con firmas propias (`campaign-automation-
 * signatures.ts`).
 *
 * REGLA CRÍTICA DE PRODUCTO — NO PUBLICACIÓN:
 * Este módulo NUNCA llama a Meta Ads, Google Ads, YouTube, email marketing,
 * redes sociales, n8n, ni ningún proveedor externo. Solo crea/actualiza
 * filas en `tasks`/`alerts` (Phase 6, ya auditadas y con RLS). Aprobar una
 * campaña ('campaign_approved') crea una tarea de PREPARACIÓN interna — la
 * publicación real sigue siendo manual/futura.
 *
 * PRINCIPIOS (idénticos a Phase 6F):
 * - Determinístico: misma entrada → mismo resultado siempre.
 * - Best-effort: un fallo al crear alertas/tareas NO altera el flujo
 *   principal — el status de campaña (source of truth, ya confirmado por la
 *   RPC/UPDATE del use case llamante) nunca se revierte por esto. El
 *   caller SIEMPRE debe invocar este evaluador DESPUÉS de que la escritura
 *   principal fue exitosa, envuelto en un helper "silently" que atrapa
 *   cualquier excepción (ver `evalCampaignAutomationSilently` en cada use
 *   case de campaña).
 * - Sin secretos: no persiste API keys, contenido IA completo, payloads
 *   crudos de proveedor, ni PII innecesaria.
 * - Multi-tenant: toda query filtra por organizationId — imposible leer/
 *   escribir cross-org (mismo contrato que AlertRepository/TaskRepository).
 * - Sin llamadas HTTP/n8n/Supabase directas: solo interfaces de repositorio
 *   inyectadas — igual que evaluateAutomationIncident.
 *
 * IDEMPOTENCIA (§4): alert_key / signature tag determinísticos por
 * (organizationId, campaignId, tipo de evento[, aiErrorKind]) — ver
 * `campaign-automation-signatures.ts`. Un evento procesado dos veces
 * (retry, double submit, Server Action repetida) produce el MISMO resultado
 * observable (una sola task/alert), nunca duplicados.
 */

import { ok } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  AlertRepository,
  TaskRepository,
  OrganizationId,
  CampaignId,
  ClientId,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';
import {
  campaignAutomationTypeCreatesTask,
  campaignAutomationTypeCreatesAlert,
  getAlertSeverityForCampaignAutomation,
  getTaskPriorityForCampaignAutomation,
  type CampaignAutomationType,
} from './campaign-automation-types';
import {
  campaignReviewRequestedKey,
  campaignRejectedKey,
  campaignApprovedKey,
  campaignAiProviderFailureKey,
  buildCampaignTaskTags,
  buildCampaignTaskSignatureTag,
} from './campaign-automation-signatures';

// ─── Input / Output ───────────────────────────────────────────────────────────

export type EvaluateCampaignAutomationInput = {
  readonly organizationId: OrganizationId;
  /**
   * NULL cuando el evento ocurre ANTES de que exista una campaña persistida
   * (fallo de IA durante `generateCampaignDraftWithAI` — nunca se crea la
   * campaña si la generación falla). Presente en todos los demás casos.
   */
  readonly campaignId: CampaignId | null;
  /** Nombre de campaña — solo para título/descripción legibles, nunca para lógica. */
  readonly campaignName: string;
  readonly clientId: ClientId | null;
  readonly automationType: CampaignAutomationType;
  /**
   * UUID real del actor autenticado que originó el evento (server-side,
   * resuelto desde la sesión — NUNCA inventado). OBLIGATORIO: `tasks
   * .created_by` es `uuid NULL REFERENCES auth.users(id)` — un valor que no
   * sea un UUID real de `auth.users` rompe la creación de la tarea (bug
   * detectado en smoke: se usaba el string literal
   * 'campaign-automation-evaluator', que no es un UUID, y la task nunca se
   * creaba — el fallo era silencioso por el diseño best-effort). Ningún
   * caller de este evaluador debe pasar un valor artificial aquí.
   */
  readonly actorUserId: string;
  /** Requerida cuando automationType === 'campaign_rejected'. */
  readonly rejectionNote?: string | null;
  /**
   * Requerido cuando automationType === 'campaign_ai_provider_failure'.
   * Viene de `getAiErrorKind(error)` (@bop-agency/domain) — ya normalizado,
   * nunca el mensaje crudo del proveedor.
   */
  readonly aiErrorKind?: string | null;
  /** Mensaje ya saneado (sin secretos/stack traces) — máx. 200 chars usados. */
  readonly safeErrorMessage?: string | null;
  readonly occurredAt: Date;
};

export type EvaluateCampaignAutomationOutput = {
  readonly alertCreated: boolean;
  readonly alertUpdated: boolean;
  readonly taskCreated: boolean;
  readonly taskSkipped: boolean;
  readonly reason: string;
};

export type EvaluateCampaignAutomationDeps = {
  alertRepository: AlertRepository;
  taskRepository: TaskRepository;
  logger: LoggerPort;
};

// ─── Use case ─────────────────────────────────────────────────────────────────

export async function evaluateCampaignAutomation(
  input: EvaluateCampaignAutomationInput,
  deps: EvaluateCampaignAutomationDeps,
): Promise<Result<EvaluateCampaignAutomationOutput>> {
  const { organizationId, campaignId, campaignName, clientId, automationType, actorUserId, occurredAt } = input;
  const { alertRepository, taskRepository, logger } = deps;

  logger.debug('evaluateCampaignAutomation: begin', {
    organizationId,
    campaignId: campaignId ? String(campaignId) : null,
    automationType,
  });

  let alertCreated = false;
  let alertUpdated = false;

  // ── Alert (solo campaign_ai_provider_failure en 7F) ───────────────────────

  if (campaignAutomationTypeCreatesAlert(automationType)) {
    const aiErrorKind = input.aiErrorKind ?? 'UNKNOWN';
    const scopeId = campaignId ? String(campaignId) : clientId ? `client:${String(clientId)}` : 'unscoped';
    const alertKey = campaignAiProviderFailureKey(organizationId, scopeId, aiErrorKind);
    const { title, description } = buildAlertContent(automationType, campaignName, input.safeErrorMessage ?? null);

    const upsertResult = await alertRepository.upsertByAlertKey({
      organizationId,
      clientId: clientId ?? null,
      alertKey,
      alertType: `campaign.${automationType}`,
      severity: getAlertSeverityForCampaignAutomation(automationType),
      title,
      description,
      metadata: {
        source: 'campaign',
        campaignId: campaignId ? String(campaignId) : null,
        eventType: automationType,
        aiErrorKind,
        actorUserId,
        occurredAt: occurredAt.toISOString(),
      },
    });

    if (upsertResult.success) {
      alertCreated = upsertResult.value.created;
      alertUpdated = !upsertResult.value.created;
      logger.info('campaign.alert.' + (alertCreated ? 'created' : 'updated'), {
        organizationId,
        campaignId: String(campaignId),
        alertKey,
      });
    } else {
      logger.warn('evaluateCampaignAutomation: alert upsert failed (best-effort)', {
        organizationId,
        campaignId: String(campaignId),
        error: upsertResult.error.code,
      });
    }
  }

  // ── Task (review_requested / rejected / approved) ─────────────────────────

  let taskCreated = false;
  let taskSkipped = false;

  if (campaignAutomationTypeCreatesTask(automationType)) {
    // Defensa: los tipos taskable (review_requested/rejected/approved) SIEMPRE
    // operan sobre una campaña ya persistida — campaignId nunca debería ser
    // null aquí. Si ocurriera (bug de caller), se loguea y se salta la task
    // en vez de lanzar (best-effort, nunca revienta el flujo principal).
    if (!campaignId) {
      taskSkipped = true;
      logger.warn('evaluateCampaignAutomation: taskable event without campaignId (unexpected)', {
        organizationId,
        automationType,
      });
    } else if (!actorUserId) {
      // Nunca se inventa un actor. Sin un UUID real de auth.users, se salta
      // la creación en vez de insertar un created_by inválido/fabricado.
      taskSkipped = true;
      logger.warn('evaluateCampaignAutomation: taskable event without actorUserId (unexpected)', {
        organizationId,
        campaignId: String(campaignId),
        automationType,
      });
    } else {
    const signatureTag = buildCampaignTaskSignatureTag(organizationId, campaignId, automationType);

    const existingTasksResult = await taskRepository.findActiveBySignatureTag(signatureTag, organizationId);
    const hasActiveTask = existingTasksResult.success && existingTasksResult.value.length > 0;

    if (hasActiveTask) {
      taskSkipped = true;
      logger.info('campaign.task.skipped_duplicate', {
        organizationId,
        campaignId: String(campaignId),
        signatureTag,
      });
    } else {
      const taskTags = buildCampaignTaskTags(organizationId, campaignId, automationType);
      taskTags.push(signatureTag);

      const { taskTitle, taskDescription } = buildTaskContent(
        automationType,
        campaignName,
        campaignId,
        input.rejectionNote ?? null,
      );

      const createTaskResult = await taskRepository.create({
        organizationId,
        clientId: clientId ? String(clientId) : null,
        title: taskTitle,
        description: taskDescription,
        priority: getTaskPriorityForCampaignAutomation(automationType),
        tags: taskTags,
        createdBy: actorUserId,
      });

      if (createTaskResult.success) {
        taskCreated = true;
        logger.info('campaign.task.created', {
          organizationId,
          campaignId: String(campaignId),
          automationType,
          taskId: String(createTaskResult.value.id),
        });
      } else {
        logger.warn('evaluateCampaignAutomation: task creation failed (best-effort)', {
          organizationId,
          campaignId: String(campaignId),
          error: createTaskResult.error.code,
        });
      }
    }
    }
  } else {
    taskSkipped = true;
  }

  const reason = buildReason(automationType, alertCreated, alertUpdated, taskCreated, taskSkipped);

  return ok({ alertCreated, alertUpdated, taskCreated, taskSkipped, reason });
}

// ─── Content builders ─────────────────────────────────────────────────────────
//
// Nunca incluyen contenido generado por IA completo, secretos, ni payloads
// crudos de proveedor — solo texto humano corto (§16 Observability / §13
// del brief: sin API keys, sin contenido de campaña completo, sin payloads
// raw, sin secretos).

function buildTaskContent(
  type: CampaignAutomationType,
  campaignName: string,
  campaignId: CampaignId,
  rejectionNote: string | null,
): { taskTitle: string; taskDescription: string } {
  const link = `/campaigns/${String(campaignId)}`;
  switch (type) {
    case 'campaign_review_requested':
      return {
        taskTitle: `Revisar campaña: ${campaignName}`,
        taskDescription: `La campaña "${campaignName}" fue enviada a revisión y requiere aprobación o rechazo de un owner/admin. Ver: ${link}`,
      };
    case 'campaign_rejected': {
      const noteSuffix = rejectionNote ? ` Nota de rechazo: ${rejectionNote.slice(0, 300)}` : '';
      return {
        taskTitle: `Campaña rechazada: ${campaignName}`,
        taskDescription: `La campaña "${campaignName}" fue rechazada en revisión.${noteSuffix} Ver: ${link}`,
      };
    }
    case 'campaign_approved':
      return {
        taskTitle: `Preparar activación de campaña: ${campaignName}`,
        taskDescription: `La campaña "${campaignName}" fue aprobada y está lista para el siguiente paso. Esta tarea NO implica publicación automática en ningún proveedor externo — la activación sigue siendo manual. Ver: ${link}`,
      };
    default:
      return {
        taskTitle: `Revisar campaña: ${campaignName}`,
        taskDescription: `Evento de campaña "${campaignName}" requiere atención. Ver: ${link}`,
      };
  }
}

function buildAlertContent(
  type: CampaignAutomationType,
  campaignName: string,
  safeErrorMessage: string | null,
): { title: string; description: string } {
  void type;
  return {
    title: `Fallo de proveedor de IA en generación de campaña`,
    description: safeErrorMessage
      ? `La generación/regeneración de contenido para "${campaignName}" falló: ${safeErrorMessage.slice(0, 200)}`
      : `La generación/regeneración de contenido para "${campaignName}" falló por un error del proveedor de IA. Revisar disponibilidad/configuración del proveedor.`,
  };
}

function buildReason(
  type: CampaignAutomationType,
  alertCreated: boolean,
  alertUpdated: boolean,
  taskCreated: boolean,
  taskSkipped: boolean,
): string {
  const parts: string[] = [`event=${type}`];
  if (alertCreated) parts.push('alert=created');
  else if (alertUpdated) parts.push('alert=updated');
  if (taskCreated) parts.push('task=created');
  else if (taskSkipped) parts.push('task=skipped');
  return parts.join(' ');
}

// ─── Re-export helpers for callers (submit/approve/reject/AI use cases) ──────

export { campaignReviewRequestedKey, campaignRejectedKey, campaignApprovedKey };
