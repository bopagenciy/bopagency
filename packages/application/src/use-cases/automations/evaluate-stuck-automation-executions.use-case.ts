/**
 * EvaluateStuckAutomationExecutionsUseCase — Phase 6F
 *
 * Detecta ejecuciones de automatización atascadas (queued/running más tiempo
 * del umbral) y crea alertas/tareas deduplicadas para cada una.
 *
 * DISEÑO:
 * - No usa cron ni scheduler interno — es un use case callable desde
 *   cualquier contexto (futuro scheduler Phase 6G, test, script).
 * - Clock inyectable para tests determinísticos.
 * - Paginación para evitar cargar miles de filas en memoria.
 * - Aislamiento multi-tenant: todas las queries filtran por organizationId.
 * - Deduplicación: no crea alertas/tareas si ya existen para la misma firma.
 *
 * UMBRALES RECOMENDADOS:
 * - queued: 10 minutos (600_000 ms) — dispatch debería ser rápido.
 * - running: 30 minutos (1_800_000 ms) — depende de la duración del workflow.
 * El caller elige los umbrales según el contexto operativo.
 *
 * RETORNO:
 * - Resumen plano con conteos de alertas/tareas creadas/omitidas.
 * - Detalles de qué automationIds tuvieron incidentes.
 */

import { ok } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  AutomationExecutionRepository,
  AlertRepository,
  TaskRepository,
  OrganizationId,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';
import { evaluateAutomationIncident } from './evaluate-automation-incident.use-case';
import type { EvaluateAutomationIncidentDeps } from './evaluate-automation-incident.use-case';

// ─── Clock port ───────────────────────────────────────────────────────────────

/** Puerto inyectable de reloj para hacer los tests determinísticos. */
export type ClockPort = {
  now(): Date;
};

/** Implementación por defecto usando Date.now(). */
export const systemClock: ClockPort = {
  now: () => new Date(),
};

// ─── Input / Output ───────────────────────────────────────────────────────────

export type EvaluateStuckAutomationExecutionsInput = {
  readonly organizationId: OrganizationId;
  /**
   * Umbral en ms para considerar una ejecución 'queued' como atascada.
   * Por defecto 600_000 ms (10 minutos).
   */
  readonly queuedThresholdMs?: number;
  /**
   * Umbral en ms para considerar una ejecución 'running' como atascada.
   * Por defecto 1_800_000 ms (30 minutos).
   */
  readonly runningThresholdMs?: number;
  /** Número máximo de ejecuciones a procesar por página. */
  readonly pageSize?: number;
};

export type StuckExecutionSummary = {
  readonly organizationId: OrganizationId;
  readonly processedQueued: number;
  readonly processedRunning: number;
  readonly alertsCreated: number;
  readonly alertsUpdated: number;
  readonly tasksCreated: number;
  readonly tasksSkipped: number;
  readonly evaluatedAt: Date;
  /** IDs de automatizaciones con incidentes detectados. */
  readonly affectedAutomationIds: string[];
};

export type EvaluateStuckAutomationExecutionsDeps = {
  executionRepository: AutomationExecutionRepository;
  alertRepository: AlertRepository;
  taskRepository: TaskRepository;
  logger: LoggerPort;
  clock?: ClockPort;
};

// ─── Use case ─────────────────────────────────────────────────────────────────

export async function evaluateStuckAutomationExecutions(
  input: EvaluateStuckAutomationExecutionsInput,
  deps: EvaluateStuckAutomationExecutionsDeps,
): Promise<Result<StuckExecutionSummary>> {
  const { organizationId } = input;
  const queuedThresholdMs  = input.queuedThresholdMs  ?? 600_000;   // 10 min
  const runningThresholdMs = input.runningThresholdMs ?? 1_800_000; // 30 min
  const pageSize           = input.pageSize           ?? 50;

  const { executionRepository, alertRepository, taskRepository, logger } = deps;
  const clock = deps.clock ?? systemClock;

  const now = clock.now();

  logger.debug('evaluateStuckAutomationExecutions: begin', {
    organizationId,
    queuedThresholdMs,
    runningThresholdMs,
    now: now.toISOString(),
  });

  const incidentDeps: EvaluateAutomationIncidentDeps = {
    alertRepository,
    taskRepository,
    logger,
  };

  // Acumuladores
  let processedQueued  = 0;
  let processedRunning = 0;
  let alertsCreated    = 0;
  let alertsUpdated    = 0;
  let tasksCreated     = 0;
  let tasksSkipped     = 0;
  const affectedAutomationIds = new Set<string>();

  // ── Procesar ejecuciones queued atascadas ────────────────────────────────

  const queuedThreshold = new Date(now.getTime() - queuedThresholdMs);

  try {
    const queuedPage = await executionRepository.listStuckCandidates(
      organizationId,
      ['queued'],
      queuedThreshold,
      pageSize,
      1,
    );

    for (const execution of queuedPage.data) {
      processedQueued++;
      affectedAutomationIds.add(String(execution.automationId));

      const result = await evaluateAutomationIncidentSilently(
        {
          organizationId,
          automationId: execution.automationId,
          executionId: execution.id,
          clientId: execution.clientId,
          eventType: 'execution_failed',
          errorCode: 'STUCK_QUEUED',
          safeErrorMessage: 'Execution has been queued beyond the expected threshold.',
          occurredAt: now,
        },
        incidentDeps,
        logger,
      );

      if (result) {
        alertsCreated += result.alertCreated ? 1 : 0;
        alertsUpdated += result.alertUpdated ? 1 : 0;
        tasksCreated  += result.taskCreated  ? 1 : 0;
        tasksSkipped  += result.taskSkipped  ? 1 : 0;
      }
    }
  } catch (e) {
    logger.warn('evaluateStuckAutomationExecutions: error processing queued executions', {
      organizationId,
      error: String(e),
    });
  }

  // ── Procesar ejecuciones running atascadas ────────────────────────────────

  const runningThreshold = new Date(now.getTime() - runningThresholdMs);

  try {
    const runningPage = await executionRepository.listStuckCandidates(
      organizationId,
      ['running'],
      runningThreshold,
      pageSize,
      1,
    );

    for (const execution of runningPage.data) {
      processedRunning++;
      affectedAutomationIds.add(String(execution.automationId));

      const result = await evaluateAutomationIncidentSilently(
        {
          organizationId,
          automationId: execution.automationId,
          executionId: execution.id,
          clientId: execution.clientId,
          eventType: 'execution_failed',
          errorCode: 'STUCK_RUNNING',
          safeErrorMessage: 'Execution has been running beyond the expected threshold.',
          occurredAt: now,
        },
        incidentDeps,
        logger,
      );

      if (result) {
        alertsCreated += result.alertCreated ? 1 : 0;
        alertsUpdated += result.alertUpdated ? 1 : 0;
        tasksCreated  += result.taskCreated  ? 1 : 0;
        tasksSkipped  += result.taskSkipped  ? 1 : 0;
      }
    }
  } catch (e) {
    logger.warn('evaluateStuckAutomationExecutions: error processing running executions', {
      organizationId,
      error: String(e),
    });
  }

  logger.info('evaluateStuckAutomationExecutions: complete', {
    organizationId,
    processedQueued,
    processedRunning,
    alertsCreated,
    alertsUpdated,
    tasksCreated,
    tasksSkipped,
  });

  // Internal observability
  if (processedQueued + processedRunning > 0) {
    logger.info('automation.stuck.detected', {
      organizationId,
      processedQueued,
      processedRunning,
      affectedAutomations: affectedAutomationIds.size,
    });
  }

  return ok({
    organizationId,
    processedQueued,
    processedRunning,
    alertsCreated,
    alertsUpdated,
    tasksCreated,
    tasksSkipped,
    evaluatedAt: now,
    affectedAutomationIds: [...affectedAutomationIds],
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Llama a evaluateAutomationIncident de forma best-effort.
 * Nunca lanza excepción — errores se loguean y retorna null.
 */
async function evaluateAutomationIncidentSilently(
  input: Parameters<typeof evaluateAutomationIncident>[0],
  deps: EvaluateAutomationIncidentDeps,
  logger: LoggerPort,
): Promise<{ alertCreated: boolean; alertUpdated: boolean; taskCreated: boolean; taskSkipped: boolean } | null> {
  try {
    const result = await evaluateAutomationIncident(input, deps);
    if (result.success) return result.value;
    logger.warn('evaluateStuckAutomationExecutions: incident eval failed', {
      automationId: String(input.automationId),
      error: result.error.code,
    });
    return null;
  } catch (e) {
    logger.warn('evaluateStuckAutomationExecutions: incident eval threw', {
      automationId: String(input.automationId),
      error: String(e),
    });
    return null;
  }
}
