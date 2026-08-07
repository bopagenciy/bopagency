/**
 * startAutomationExecution — Caso de uso principal de Phase 6D.
 *
 * Solicita la ejecución de una automatización, garantizando:
 * - Idempotencia: no se crean dos ejecuciones para la misma idempotencyKey
 *   en la misma organización, incluso bajo concurrencia.
 * - Coherencia: si el dispatch falla, la ejecución queda en estado "failed"
 *   con errorCode DISPATCH_FAILED (no queda silenciosamente en "queued").
 * - Aislamiento multi-tenant: todas las queries filtran por organizationId.
 * - Seguridad: inputMetadata es sanitizada antes de persistir (sin secretos).
 *
 * FLUJO (at-least-once delivery con idempotencia):
 * 1. Validar entrada.
 * 2. Obtener automation por (organizationId, automationId).
 * 3. Verificar pertenencia a la organización y estado 'active'.
 * 4. Construir/validar idempotencyKey.
 * 5. Buscar ejecución existente por (organizationId, idempotencyKey).
 * 6. Si existe → devolver como resultado idempotente (no despachar de nuevo).
 * 7. Crear ejecución en estado 'queued'.
 *    - Si hay unique violation (concurrencia) → recuperar y devolver existente.
 * 8. Despachar via WorkflowDispatcherPort.
 * 9a. Dispatch ok  → loguear 'execution.dispatched', mantener 'queued'.
 * 9b. Dispatch fail → marcar 'failed' (DISPATCH_FAILED), loguear 'execution.dispatch_failed'.
 * 10. Devolver resultado tipado.
 *
 * DEUDA TÉCNICA:
 * - Garantía exactly-once requeriría un outbox pattern (documentado en 6D report).
 * - Si el update a 'failed' también falla, la ejecución queda en 'queued' sin
 *   dispatch — el scheduling de Phase 6F deberá detectar y corregir esto.
 *
 * NO incluye:
 * - UI, Server Actions, scheduling, cron.
 * - Llamadas reales a n8n (inyectadas via WorkflowDispatcherPort).
 */

import { ok, err, isOk, isErr } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  AutomationId,
  AutomationExecution,
  AutomationTriggerType,
  AutomationExecutionId,
  IdempotencyKey,
  OrganizationId,
  ClientId,
  AutomationRepository,
  AutomationExecutionRepository,
  ExecutionLogRepository,
  ExecutionLogEventType,
} from '@bop-agency/domain';
import {
  idempotencyKeyFromString,
  automationNotActive,
  dispatchFailed,
} from '@bop-agency/domain';
import type { WorkflowDispatcherPort } from '../../ports/workflow-dispatcher.port';
import type { AlertRepository } from '@bop-agency/domain';
import type { TaskRepository } from '@bop-agency/domain';
import { evaluateAutomationIncident } from './evaluate-automation-incident.use-case';
import type { LoggerPort } from '../../ports/logger.port';

// ─── Input / Output ───────────────────────────────────────────────────────────

export type StartAutomationExecutionInput = {
  readonly organizationId: OrganizationId;
  readonly automationId: AutomationId;
  /** Null si la automatización es global (no vinculada a cliente). */
  readonly clientId: ClientId | null;
  readonly triggerType: AutomationTriggerType;
  /** UserId, nombre de sistema, o null si es desconocido (webhook anónimo). */
  readonly triggeredBy: string | null;
  /**
   * Metadatos de entrada sanitizados.
   * El use case elimina claves prohibidas antes de persistir.
   * NUNCA incluir secretos, tokens ni credenciales aquí.
   */
  readonly inputMetadata?: Record<string, unknown>;
  /**
   * Clave de idempotencia opcional.
   * Si no se proporciona, se genera automáticamente desde el contexto.
   * Siempre está scoped por organizationId en el repositorio.
   */
  readonly idempotencyKey?: string;
  /**
   * URL de callback para que n8n notifique el resultado.
   * Si no se proporciona, se usa cadena vacía.
   *
   * NOTA DE SEGURIDAD: la implementación concreta usada en producción
   * (N8nWebhookDispatcher, ver packages/infrastructure/src/n8n) IGNORA
   * este campo y siempre resuelve callbackUrl server-side desde
   * NEXT_PUBLIC_APP_URL — nunca confía en un valor provisto por el caller
   * (evita SSRF). Este campo se mantiene en el contrato para no romper
   * otras implementaciones de WorkflowDispatcherPort (fakes/tests), pero
   * ningún caller de este use case debe poblarlo con input de un cliente.
   */
  readonly callbackUrl?: string;
};

export type StartAutomationExecutionOutput = {
  readonly execution: AutomationExecution;
  /** true si esta llamada creó la ejecución. */
  readonly created: boolean;
  /** true si el dispatch fue enviado exitosamente en esta llamada. */
  readonly dispatched: boolean;
  /** true si se recuperó una ejecución preexistente (idempotencia). */
  readonly duplicate: boolean;
};

export type StartAutomationExecutionDeps = {
  automationRepository: AutomationRepository;
  executionRepository: AutomationExecutionRepository;
  executionLogRepository: ExecutionLogRepository;
  dispatcher: WorkflowDispatcherPort;
  logger: LoggerPort;
  /** Phase 6F: opcional. Si se provee, se evalúan incidentes best-effort. */
  alertRepository?: AlertRepository;
  taskRepository?: TaskRepository;
};

// ─── Use case ─────────────────────────────────────────────────────────────────

export async function startAutomationExecution(
  input: StartAutomationExecutionInput,
  deps: StartAutomationExecutionDeps,
): Promise<Result<StartAutomationExecutionOutput>> {
  const { organizationId, automationId, triggerType, callbackUrl = '' } = input;
  const triggeredBy = input.triggeredBy ?? 'system';

  deps.logger.debug('startAutomationExecution: begin', {
    organizationId,
    automationId,
    triggerType,
  });

  // ── PASO 1-3: Cargar automation y verificar estado ────────────────────────

  const automationResult = await deps.automationRepository.findById(automationId, organizationId);
  if (isErr(automationResult)) {
    // Retorna NOT_FOUND si no existe O no pertenece a la organización
    return automationResult;
  }

  const automation = automationResult.value;

  if (automation.status !== 'active') {
    return err(automationNotActive(String(automationId), automation.status));
  }

  // ── PASO 4: Construir idempotencyKey ──────────────────────────────────────

  let idempotencyKey: IdempotencyKey;
  if (input.idempotencyKey) {
    try {
      idempotencyKey = idempotencyKeyFromString(input.idempotencyKey);
    } catch {
      return err({
        code: 'VALIDATION_ERROR' as const,
        message: 'idempotencyKey inválida: no puede estar vacía',
      });
    }
  } else {
    // Generar clave determinística desde el contexto de la solicitud.
    // Incluye timestamp para unicidad en triggers manuales repetidos.
    const raw = `${organizationId}:${automationId}:${triggerType}:${Date.now()}`;
    idempotencyKey = idempotencyKeyFromString(raw);
  }

  // ── PASO 5-6: Buscar ejecución existente por idempotencyKey ─────────────

  const existingResult = await deps.executionRepository.findByIdempotencyKey(
    idempotencyKey,
    organizationId,
  );
  if (isErr(existingResult)) {
    deps.logger.error('startAutomationExecution: error buscando por idempotencyKey', existingResult.error);
    return existingResult;
  }

  if (existingResult.value !== null) {
    deps.logger.info('startAutomationExecution: idempotent — ejecución ya existe', {
      organizationId,
      automationId,
      executionId: existingResult.value.id,
    });
    return ok({
      execution: existingResult.value,
      created: false,
      dispatched: false,
      duplicate: true,
    });
  }

  // ── PASO 7: Sanitizar metadata y crear ejecución en 'queued' ─────────────

  const safeMetadata = sanitizeMetadata(input.inputMetadata ?? {});

  const createResult = await deps.executionRepository.create({
    organizationId,
    automationId,
    clientId: input.clientId,
    idempotencyKey,
    triggeredBy,
    triggerType,
    attempt: 1,
    inputMetadata: safeMetadata,
  });

  if (isErr(createResult)) {
    // Unique violation (23505 → CONFLICT): solicitud concurrente con la misma key
    if (createResult.error.code === 'CONFLICT') {
      deps.logger.info('startAutomationExecution: unique violation — recuperando ejecución concurrente', {
        organizationId,
        automationId,
      });

      // Recuperar la ejecución creada por la solicitud concurrente
      const recoveryResult = await deps.executionRepository.findByIdempotencyKey(
        idempotencyKey,
        organizationId,
      );
      if (isOk(recoveryResult) && recoveryResult.value !== null) {
        return ok({
          execution: recoveryResult.value,
          created: false,
          dispatched: false,
          duplicate: true,
        });
      }
      // Si no podemos recuperar, reportar el conflicto original
    }
    deps.logger.error('startAutomationExecution: error al crear ejecución', createResult.error);
    return createResult;
  }

  const execution = createResult.value;

  // Loguear: execution.queued
  await logSilently(deps.executionLogRepository, {
    executionId: execution.id,
    organizationId,
    level: 'info',
    event: 'execution.queued',
    message: `Automation execution queued`,
    context: {
      automationId: String(automationId),
      triggerType,
      attempt: execution.attempt,
    },
  }, deps.logger);

  // ── PASO 8: Despachar via WorkflowDispatcherPort ──────────────────────────

  const dispatchResult = await deps.dispatcher.dispatch(automationId, {
    idempotencyKey: String(idempotencyKey),
    payload: {
      executionId: String(execution.id),
      organizationId: String(organizationId),
      clientId: input.clientId ? String(input.clientId) : null,
      triggerType,
      callbackUrl,
      metadata: safeMetadata,
    },
  });

  // ── PASO 9a: Dispatch exitoso ─────────────────────────────────────────────

  if (isOk(dispatchResult)) {
    await logSilently(deps.executionLogRepository, {
      executionId: execution.id,
      organizationId,
      level: 'info',
      event: 'execution.dispatched',
      message: 'Execution dispatched successfully',
      context: {
        automationId: String(automationId),
        externalRunId: dispatchResult.value.externalRunId ?? null,
        dispatchedAt: dispatchResult.value.dispatchedAt.toISOString(),
      },
    }, deps.logger);

    deps.logger.info('startAutomationExecution: dispatched', {
      organizationId,
      automationId,
      executionId: execution.id,
    });

    return ok({
      execution,
      created: true,
      dispatched: true,
      duplicate: false,
    });
  }

  // ── PASO 9b: Dispatch fallido → marcar 'failed' ───────────────────────────

  deps.logger.warn('startAutomationExecution: dispatch failed, marking execution as failed', {
    organizationId,
    automationId,
    executionId: execution.id,
    errorCode: dispatchResult.error.code,
  });

  const failResult = await deps.executionRepository.updateStatus(
    execution.id,
    organizationId,
    {
      status: 'failed',
      completedAt: new Date(),
      errorCode: 'DISPATCH_FAILED',
      errorMessage: 'Dispatch to workflow engine failed. Retry is available.',
    },
  );

  // Loguear: execution.dispatch_failed
  await logSilently(deps.executionLogRepository, {
    executionId: execution.id,
    organizationId,
    level: 'error',
    event: 'execution.dispatch_failed',
    message: 'Execution dispatch failed',
    context: {
      automationId: String(automationId),
      errorCode: 'DISPATCH_FAILED',
      // No loguear detalles técnicos del dispatcher
    },
  }, deps.logger);

  // Si el update también falla, devolvemos el error de dispatch (más relevante)
  if (isErr(failResult)) {
    deps.logger.error('startAutomationExecution: también falló el update a failed', failResult.error);
    // Devolver la ejecución en estado 'queued' con la advertencia
    return err(dispatchFailed(
      'Dispatch failed and execution state update also failed. Manual review required.',
    ));
  }

  // ── Phase 6F: Evaluar incidente best-effort ─────────────────────────────────
  if (deps.alertRepository && deps.taskRepository) {
    await evalIncidentSilently({
      organizationId,
      automationId,
      executionId: execution.id,
      clientId: input.clientId,
      eventType: 'dispatch_failed',
      errorCode: 'DISPATCH_FAILED',
      safeErrorMessage: 'Dispatch to workflow engine failed.',
      occurredAt: new Date(),
      alertRepository: deps.alertRepository,
      taskRepository: deps.taskRepository,
      logger: deps.logger,
    });
  }

  // Devolver la ejecución como failed (permite retry posterior)
  return ok({
    execution: failResult.value,
    created: true,
    dispatched: false,
    duplicate: false,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Claves prohibidas en inputMetadata — nunca persistir ni enviar a n8n. */
const FORBIDDEN_METADATA_KEYS = new Set([
  'secret', 'token', 'key', 'password', 'auth', 'credential',
  'cred', 'private', 'bearer', 'oauth', 'email', 'phone', 'ssn',
]);

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([k]) => {
      const lower = k.toLowerCase();
      return !Array.from(FORBIDDEN_METADATA_KEYS).some((p) => lower.includes(p));
    }),
  );
}

type LogInput = {
  executionId: AutomationExecutionId;
  organizationId: OrganizationId;
  level: 'info' | 'warn' | 'error';
  event: ExecutionLogEventType;
  message: string;
  context?: Record<string, unknown>;
};

/**
 * Registra un log sin interrumpir el flujo principal si falla.
 * El log es best-effort — no debe propagar errores.
 */
async function logSilently(
  repo: ExecutionLogRepository,
  input: LogInput,
  logger: LoggerPort,
): Promise<void> {
  try {
    await repo.log(input);
  } catch (e) {
    logger.warn('startAutomationExecution: log failed silently', { error: String(e) });
  }
}

// ─── Phase 6F: best-effort incident evaluation ────────────────────────────────

async function evalIncidentSilently(params: {
  organizationId: Parameters<typeof evaluateAutomationIncident>[0]['organizationId'];
  automationId: Parameters<typeof evaluateAutomationIncident>[0]['automationId'];
  executionId: Parameters<typeof evaluateAutomationIncident>[0]['executionId'];
  clientId: Parameters<typeof evaluateAutomationIncident>[0]['clientId'];
  eventType: Parameters<typeof evaluateAutomationIncident>[0]['eventType'];
  errorCode: string | null;
  safeErrorMessage: string | null;
  occurredAt: Date;
  alertRepository: AlertRepository;
  taskRepository: TaskRepository;
  logger: LoggerPort;
}): Promise<void> {
  const { alertRepository, taskRepository, logger, ...incidentInput } = params;
  try {
    await evaluateAutomationIncident(incidentInput, { alertRepository, taskRepository, logger });
  } catch (e) {
    logger.warn('evalIncidentSilently: incident evaluation threw unexpectedly', {
      error: String(e),
      automationId: String(params.automationId),
    });
  }
}
