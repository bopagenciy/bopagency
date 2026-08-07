/**
 * EvaluateAutomationIncidentUseCase — Phase 6F
 *
 * Evaluador determinístico de incidentes de automatización.
 * Crea, actualiza o resuelve alertas y tareas operativas según el tipo
 * de evento y errorCode recibido.
 *
 * PRINCIPIOS:
 * - Determinístico: misma entrada → mismo resultado siempre.
 * - Best-effort: un fallo al crear alertas/tareas NO altera el flujo principal.
 * - Sin secretos: no persiste tokens, payloads HMAC ni stack traces.
 * - Multi-tenant: todas las queries filtran por organizationId.
 * - Sin Supabase/Next.js/process.env: solo interfaces de repositorio.
 *
 * FLUJOS:
 * A. DISPATCH_FAILED → alerta warning + tarea high
 * B. EXECUTION_FAILED (errorCode != DISPATCH_FAILED) → alerta info/warning + tarea según severidad
 * C. MAX_ATTEMPTS_REACHED → alerta warning + tarea high
 * D. SUCCEEDED → resolver alertas recuperables activas de la misma automation
 *
 * DEDUPLICACIÓN:
 * - alert_key determinístico por (orgId, automationId, tipo, errorCode)
 * - Tarea: deduplicada por signatureTag en tags[]
 * - No se crean duplicados en reintentos repetidos
 *
 * CONSISTENCIA EVENTUAL:
 * - El caller principal (start-execution, retry-execution, webhook) no debe
 *   fallar si este evaluador falla. Toda excepción debe ser capturada por el
 *   llamador con best-effort (evalSilently).
 */

import { ok } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  AlertRepository,
  TaskRepository,
  OrganizationId,
  AutomationId,
  AutomationExecutionId,
  ClientId,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';
import {
  classifyErrorCode,
  getAlertSeverityForIncident,
  getTaskPriorityForIncident,
  isRecoverableIncident,
  type AutomationIncidentType,
} from './automation-incident-severity';
import {
  dispatchFailedKey,
  executionFailedKey,
  maxAttemptsKey,
  recoverableAlertKeyPrefixes,
  buildTaskTags,
  buildTaskSignatureTag,
} from './automation-incident-signatures';

// ─── Input / Output ───────────────────────────────────────────────────────────

export type IncidentEventType =
  | 'dispatch_failed'
  | 'execution_failed'
  | 'max_attempts_reached'
  | 'execution_succeeded';

export type EvaluateAutomationIncidentInput = {
  readonly organizationId: OrganizationId;
  readonly automationId: AutomationId;
  readonly executionId: AutomationExecutionId;
  readonly clientId: ClientId | null;
  readonly eventType: IncidentEventType;
  /** Código de error estructurado. Null para succeeded. */
  readonly errorCode: string | null;
  /**
   * Mensaje de error seguro — NO debe contener secretos, tokens, stack traces.
   * Ya sanitizado por el caller. Máx 500 chars recomendado.
   */
  readonly safeErrorMessage: string | null;
  readonly occurredAt: Date;
};

export type EvaluateAutomationIncidentOutput = {
  readonly alertCreated: boolean;
  readonly alertUpdated: boolean;
  readonly alertResolved: boolean;
  readonly alertsResolvedCount: number;
  readonly taskCreated: boolean;
  readonly taskSkipped: boolean;
  readonly reason: string;
};

export type EvaluateAutomationIncidentDeps = {
  alertRepository: AlertRepository;
  taskRepository: TaskRepository;
  logger: LoggerPort;
};

// ─── Use case ─────────────────────────────────────────────────────────────────

export async function evaluateAutomationIncident(
  input: EvaluateAutomationIncidentInput,
  deps: EvaluateAutomationIncidentDeps,
): Promise<Result<EvaluateAutomationIncidentOutput>> {
  const { organizationId, automationId, executionId, clientId, eventType, errorCode, safeErrorMessage, occurredAt } = input;
  const { alertRepository, taskRepository, logger } = deps;

  logger.debug('evaluateAutomationIncident: begin', {
    organizationId,
    automationId,
    executionId: String(executionId),
    eventType,
    errorCode,
  });

  // ── A. Recuperación: ejecución exitosa ────────────────────────────────────

  if (eventType === 'execution_succeeded') {
    return handleRecovery({ organizationId, automationId, executionId, logger, alertRepository });
  }

  // ── B-D. Clasificar incidente ─────────────────────────────────────────────

  let incidentType: AutomationIncidentType;
  if (eventType === 'dispatch_failed') {
    incidentType = 'DISPATCH_FAILED';
  } else if (eventType === 'max_attempts_reached') {
    incidentType = 'MAX_ATTEMPTS_REACHED';
  } else {
    // execution_failed: clasificar por errorCode
    incidentType = classifyErrorCode(errorCode);
  }

  const alertSeverity = getAlertSeverityForIncident(incidentType);
  const taskPriority  = getTaskPriorityForIncident(incidentType);

  // ── Construir alert_key determinístico ────────────────────────────────────

  let alertKey: string;
  if (incidentType === 'DISPATCH_FAILED') {
    alertKey = dispatchFailedKey(organizationId, automationId);
  } else if (incidentType === 'MAX_ATTEMPTS_REACHED') {
    alertKey = maxAttemptsKey(organizationId, automationId);
  } else {
    // execution-failed con errorCode específico
    alertKey = executionFailedKey(organizationId, automationId, errorCode ?? 'UNKNOWN');
  }

  // ── Construir título y descripción seguros ────────────────────────────────

  const { title, description } = buildSafeAlertContent(incidentType, automationId, safeErrorMessage);

  // ── Upsert alerta (deduplicada por alert_key) ─────────────────────────────

  let alertCreated = false;
  let alertUpdated = false;

  const upsertResult = await alertRepository.upsertByAlertKey({
    organizationId,
    clientId: clientId ?? null,
    alertKey,
    alertType: `automation.${incidentType.toLowerCase()}`,
    severity: alertSeverity,
    title,
    description,
    metadata: {
      automationId: String(automationId),
      executionId: String(executionId),
      incidentType,
      occurredAt: occurredAt.toISOString(),
      // No incluir errorCode completo si puede contener info sensible
      errorCategory: incidentType,
    },
  });

  if (upsertResult.success) {
    logger.info('evaluateAutomationIncident: alert upserted', {
      automationId,
      alertKey,
      created: upsertResult.value.created,
    });
    if (upsertResult.value.created) {
      alertCreated = true;
    } else {
      alertUpdated = true;
    }
    // Emit internal observability event
    logger.info('automation.alert.' + (alertCreated ? 'created' : 'updated'), {
      organizationId,
      automationId,
      alertKey,
      severity: alertSeverity,
    });
  } else {
    logger.warn('evaluateAutomationIncident: alert upsert failed (best-effort)', {
      organizationId,
      automationId,
      error: upsertResult.error.code,
    });
  }

  // ── Crear tarea operativa si corresponde ──────────────────────────────────

  let taskCreated = false;
  let taskSkipped = false;

  const shouldCreateTask = incidentTypeShouldCreateTask(incidentType);

  if (shouldCreateTask) {
    const signatureTag = buildTaskSignatureTag(organizationId, automationId, incidentType);

    // Deduplicación: buscar tarea activa con misma firma
    const existingTasksResult = await taskRepository.findActiveBySignatureTag(signatureTag, organizationId);

    let hasActiveTask = false;
    if (existingTasksResult.success && existingTasksResult.value.length > 0) {
      hasActiveTask = true;
    }

    if (hasActiveTask) {
      taskSkipped = true;
      logger.info('automation.task.skipped_duplicate', {
        organizationId,
        automationId,
        signatureTag,
      });
    } else {
      const taskTags = buildTaskTags(organizationId, automationId, incidentType);
      taskTags.push(signatureTag);

      const { taskTitle, taskDescription } = buildTaskContent(incidentType, automationId);

      const createTaskResult = await taskRepository.create({
        organizationId,
        clientId: clientId ? String(clientId) : null,
        title: taskTitle,
        description: taskDescription,
        priority: taskPriority,
        tags: taskTags,
        createdBy: 'automation-incident-evaluator',
      });

      if (createTaskResult.success) {
        taskCreated = true;
        logger.info('automation.task.created', {
          organizationId,
          automationId,
          incidentType,
          taskId: String(createTaskResult.value.id),
        });
      } else {
        logger.warn('evaluateAutomationIncident: task creation failed (best-effort)', {
          organizationId,
          automationId,
          error: createTaskResult.error.code,
        });
      }
    }
  } else {
    taskSkipped = true;
  }

  const reason = buildReason(incidentType, alertCreated, alertUpdated, taskCreated, taskSkipped);

  return ok({
    alertCreated,
    alertUpdated,
    alertResolved: false,
    alertsResolvedCount: 0,
    taskCreated,
    taskSkipped,
    reason,
  });
}

// ─── Recovery handler ─────────────────────────────────────────────────────────

async function handleRecovery(params: {
  organizationId: OrganizationId;
  automationId: AutomationId;
  executionId: AutomationExecutionId;
  logger: LoggerPort;
  alertRepository: AlertRepository;
}): Promise<Result<EvaluateAutomationIncidentOutput>> {
  const { organizationId, automationId, executionId, logger, alertRepository } = params;

  const prefixes = recoverableAlertKeyPrefixes(organizationId, automationId);

  const resolveResult = await alertRepository.resolveActiveByAlertKeyPrefixes(
    prefixes,
    organizationId,
    `automation-recovery:${String(executionId)}`,
  );

  let resolvedCount = 0;
  if (resolveResult.success) {
    resolvedCount = resolveResult.value;
    if (resolvedCount > 0) {
      logger.info('automation.alert.resolved', {
        organizationId,
        automationId,
        executionId: String(executionId),
        resolvedCount,
      });
    }
  } else {
    // Logging seguro para diagnóstico: solo identificadores y código de error
    // interno. Nunca secretos, HMAC, payload completo, headers ni PII.
    logger.warn('evaluateAutomationIncident: recovery resolve failed (best-effort)', {
      organizationId,
      automationId,
      executionId: String(executionId),
      incidentType: 'RECOVERY',
      errorCode: resolveResult.error.code,
    });
  }

  return ok({
    alertCreated: false,
    alertUpdated: false,
    alertResolved: resolvedCount > 0,
    alertsResolvedCount: resolvedCount,
    taskCreated: false,
    taskSkipped: true,
    reason: `Recovery: resolved ${resolvedCount} active alert(s) for automation ${String(automationId)}`,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determina si el tipo de incidente debe crear una tarea operativa.
 * No se crean tareas para: succeeded, transient errors recuperados,
 * errores genéricos sin acción humana clara.
 */
function incidentTypeShouldCreateTask(type: AutomationIncidentType): boolean {
  const taskableTypes: AutomationIncidentType[] = [
    'DISPATCH_FAILED',
    'MAX_ATTEMPTS_REACHED',
    'EXECUTION_FAILED_CRITICAL',
    'STUCK_RUNNING',
    'STUCK_QUEUED',
  ];
  return taskableTypes.includes(type);
}

/**
 * Construye título y descripción de alerta seguros (sin datos técnicos sensibles).
 */
function buildSafeAlertContent(
  type: AutomationIncidentType,
  automationId: AutomationId,
  safeErrorMessage: string | null,
): { title: string; description: string } {
  void automationId; // reserved for future per-automation customization

  switch (type) {
    case 'DISPATCH_FAILED':
      return {
        title: 'Dispatch de automatización fallido',
        description: `La automatización no pudo ser enviada al motor de workflows. Revisar la configuración de n8n y la disponibilidad del servicio.`,
      };
    case 'MAX_ATTEMPTS_REACHED':
      return {
        title: 'Reintentos agotados en automatización',
        description: `La automatización agotó todos los reintentos permitidos. Se requiere intervención manual para revisar el workflow y la configuración.`,
      };
    case 'TIMEOUT':
      return {
        title: 'Ejecución de automatización con timeout',
        description: `La ejecución superó el tiempo máximo esperado. Verificar el workflow en n8n.`,
      };
    case 'EXECUTION_FAILED_CRITICAL':
      return {
        title: 'Error crítico en automatización',
        description: `Error de configuración detectado. Verificar credenciales, permisos y existencia del workflow.`,
      };
    case 'STUCK_RUNNING':
      return {
        title: 'Ejecución atascada (running)',
        description: `Una ejecución lleva más tiempo del umbral esperado en estado running. Verificar el estado en n8n.`,
      };
    case 'STUCK_QUEUED':
      return {
        title: 'Ejecución atascada (queued)',
        description: `Una ejecución lleva más tiempo del umbral esperado en estado queued. Posible problema de dispatch.`,
      };
    default:
      return {
        title: 'Fallo en ejecución de automatización',
        description: safeErrorMessage
          ? `Ejecución fallida: ${safeErrorMessage.slice(0, 200)}`
          : `La ejecución de la automatización falló. Revisar los logs de ejecución para más detalle.`,
      };
  }
}

/**
 * Construye título y descripción de tarea operativa.
 */
function buildTaskContent(
  type: AutomationIncidentType,
  _automationId: AutomationId,
): { taskTitle: string; taskDescription: string } {
  switch (type) {
    case 'DISPATCH_FAILED':
      return {
        taskTitle: 'Revisar conexión con motor de workflows',
        taskDescription: 'El dispatch de automatización falló. Verificar: (1) URL de n8n configurada, (2) referencia al workflow, (3) disponibilidad del servicio. No incluir secretos o tokens en comentarios de tarea.',
      };
    case 'MAX_ATTEMPTS_REACHED':
      return {
        taskTitle: 'Investigar automatización con reintentos agotados',
        taskDescription: 'Se agotaron todos los reintentos permitidos. Acciones: (1) Revisar el workflow en n8n, (2) Revisar el input de la ejecución, (3) Corregir configuración, (4) Decidir si ejecutar manualmente.',
      };
    case 'EXECUTION_FAILED_CRITICAL':
      return {
        taskTitle: 'Corregir error crítico en automatización',
        taskDescription: 'Error de configuración crítico detectado. Verificar: (1) Credenciales del workflow, (2) Permisos de acceso, (3) Existencia del workflow en n8n.',
      };
    case 'STUCK_RUNNING':
      return {
        taskTitle: 'Investigar ejecución atascada en running',
        taskDescription: 'Una ejecución lleva más tiempo del umbral en estado running. Verificar en n8n si el workflow está colgado y considerar cancelación manual.',
      };
    case 'STUCK_QUEUED':
      return {
        taskTitle: 'Investigar ejecución atascada en queued',
        taskDescription: 'Una ejecución lleva más tiempo del umbral en estado queued. Posible problema de dispatch. Verificar la conectividad con n8n.',
      };
    default:
      return {
        taskTitle: 'Revisar fallo en automatización',
        taskDescription: 'Revisar los logs de ejecución de la automatización para identificar y corregir el problema.',
      };
  }
}

function buildReason(
  incidentType: AutomationIncidentType,
  alertCreated: boolean,
  alertUpdated: boolean,
  taskCreated: boolean,
  taskSkipped: boolean,
): string {
  const parts: string[] = [`incident=${incidentType}`];
  if (alertCreated) parts.push('alert=created');
  else if (alertUpdated) parts.push('alert=updated');
  else parts.push('alert=failed');
  if (taskCreated) parts.push('task=created');
  else if (taskSkipped) parts.push('task=skipped');
  return parts.join(' ');
}

// ─── Re-export for convenience ────────────────────────────────────────────────

export { isRecoverableIncident };
