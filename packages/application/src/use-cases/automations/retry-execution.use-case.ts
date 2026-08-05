/**
 * retryAutomationExecution — Crea un nuevo intento de una ejecución fallida.
 *
 * REGLAS:
 * - Solo ejecuciones en estado 'failed' pueden reintentarse.
 * - Se valida que attempt < maxAttempts (desde retryPolicy de Automation).
 * - Se crea una NUEVA fila en automation_executions (no se sobrescribe la anterior).
 * - attempt = previousExecution.attempt + 1
 * - Nueva idempotencyKey: `${previousKey}:retry:${newAttempt}` (sanitizada, ≤500 chars)
 * - previousExecutionId se almacena en inputMetadata para trazabilidad.
 *
 * COMPORTAMIENTO CON BACKOFF (HALLAZGO 1 — Phase 6D correctivo):
 * - Si nextEligibleAt > now: NO se crea una nueva ejecución, NO se despacha.
 *   Se devuelve { retryDeferred: true, nextEligibleAt } al caller.
 *   El caller (o futuro scheduler en Phase 6E) decide cuándo invocar de nuevo.
 * - Si el retry es elegible (sin backoff o backoff ya expirado): se crea la
 *   ejecución, se despacha normalmente y se devuelve { retryDeferred: false }.
 *
 * IDEMPOTENCIA CONCURRENTE (HALLAZGO 3):
 * - La idempotencyKey de retry es determinística: misma key para el mismo intento.
 * - Si dos solicitudes concurrentes llegan, la segunda recibe 23505 (CONFLICT).
 * - En ese caso se recupera la ejecución existente vía findByIdempotencyKey y se
 *   devuelve como resultado exitoso (sin re-despachar).
 * - La key está limitada a 500 chars (límite DB). Si se excede, se retorna error.
 *
 * DEUDA TÉCNICA:
 * - outbox pattern para garantías at-least-once del dispatch.
 * - Scheduler para retries diferidos (Phase 6E).
 */

import { ok, err, isOk, isErr } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  AutomationExecutionId,
  AutomationExecution,
  IdempotencyKey,
  OrganizationId,
  AutomationRepository,
  AutomationExecutionRepository,
  ExecutionLogRepository,
} from '@bop-agency/domain';
import {
  idempotencyKeyFromString,
  canRetryExecution,
  retryNotAllowed,
  maxAttemptsReached,
} from '@bop-agency/domain';
import type { WorkflowDispatcherPort } from '../../ports/workflow-dispatcher.port';
import type { LoggerPort } from '../../ports/logger.port';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Límite impuesto por la columna DB: char_length(idempotency_key) ≤ 500. */
const MAX_IDEMPOTENCY_KEY_LENGTH = 500;

// ─── Input / Output ───────────────────────────────────────────────────────────

export type RetryAutomationExecutionInput = {
  readonly organizationId: OrganizationId;
  readonly executionId: AutomationExecutionId;
  /** UserId o nombre del sistema que solicita el reintento. */
  readonly requestedBy: string;
  /**
   * Idempotency key para la nueva solicitud de retry.
   * Si no se proporciona, se genera automáticamente desde la clave previa.
   */
  readonly idempotencyKey?: string;
};

/**
 * Resultado discriminado según si el retry fue diferido o ejecutado.
 *
 * retryDeferred: true  → backoff activo; NO se creó ejecución. Caller debe
 *                        reintentar a partir de nextEligibleAt (Phase 6E scheduler).
 * retryDeferred: false → ejecución creada y despachada (o recover de concurrente).
 */
export type RetryAutomationExecutionOutput =
  | {
      readonly retryDeferred: true;
      /** Fecha mínima en que el retry puede ejecutarse según el backoff. */
      readonly nextEligibleAt: Date;
      /** Ejecución que generó el retry. */
      readonly previousExecutionId: AutomationExecutionId;
    }
  | {
      readonly retryDeferred: false;
      readonly execution: AutomationExecution;
      /** Ejecución anterior que fue reintentada. */
      readonly previousExecutionId: AutomationExecutionId;
      /** Número de intento de la nueva ejecución. */
      readonly attempt: number;
      /** true si el dispatch fue enviado en esta llamada. */
      readonly dispatched: boolean;
      /** Siempre null cuando retryDeferred es false. */
      readonly nextEligibleAt: null;
    };

export type RetryAutomationExecutionDeps = {
  automationRepository: AutomationRepository;
  executionRepository: AutomationExecutionRepository;
  executionLogRepository: ExecutionLogRepository;
  dispatcher: WorkflowDispatcherPort;
  logger: LoggerPort;
};

// ─── Use case ─────────────────────────────────────────────────────────────────

export async function retryAutomationExecution(
  input: RetryAutomationExecutionInput,
  deps: RetryAutomationExecutionDeps,
): Promise<Result<RetryAutomationExecutionOutput>> {
  const { organizationId, executionId, requestedBy } = input;

  deps.logger.debug('retryAutomationExecution: begin', { organizationId, executionId, requestedBy });

  // ── Cargar ejecución anterior ─────────────────────────────────────────────

  const execResult = await deps.executionRepository.findById(executionId, organizationId);
  if (isErr(execResult)) {
    return execResult;
  }

  const previous = execResult.value;

  // ── Verificar que puede reintentarse ──────────────────────────────────────

  if (previous.status !== 'failed') {
    return err(retryNotAllowed(previous.status));
  }

  // ── Cargar automation para obtener retryPolicy ────────────────────────────

  const automationResult = await deps.automationRepository.findById(
    previous.automationId,
    organizationId,
  );
  if (isErr(automationResult)) {
    return automationResult;
  }

  const automation = automationResult.value;
  const maxAttempts = automation.retryPolicy.maxAttempts;

  if (!canRetryExecution(previous, maxAttempts)) {
    return err(maxAttemptsReached(previous.attempt, maxAttempts));
  }

  const newAttempt = previous.attempt + 1;

  // ── Calcular backoff ANTES de crear ejecución ─────────────────────────────

  const delayMs = computeBackoffDelay(newAttempt, automation.retryPolicy);
  const now = Date.now();
  const nextEligibleAt = delayMs > 0 ? new Date(now + delayMs) : null;

  deps.logger.debug('retryAutomationExecution: backoff calculated', {
    attempt: newAttempt,
    delayMs,
    nextEligibleAt: nextEligibleAt?.toISOString() ?? null,
  });

  // ── HALLAZGO 1: Si hay backoff, diferir sin crear ejecución ──────────────
  // No quedan ejecuciones huérfanas en la DB sin consumidor.

  if (nextEligibleAt !== null) {
    deps.logger.info('retryAutomationExecution: backoff pending — deferring retry, no execution created', {
      organizationId,
      previousExecutionId: executionId,
      nextEligibleAt: nextEligibleAt.toISOString(),
      delayMs,
    });

    await logSilently(deps.executionLogRepository, {
      executionId,
      organizationId,
      level: 'info',
      event: 'execution.retry_deferred',
      message: `Retry deferred by ${requestedBy} — backoff ${delayMs}ms (attempt ${newAttempt}/${maxAttempts})`,
      context: {
        automationId: String(previous.automationId),
        previousAttempt: previous.attempt,
        newAttempt,
        requestedBy,
        backoffMs: delayMs,
        nextEligibleAt: nextEligibleAt.toISOString(),
      },
    }, deps.logger);

    return ok({
      retryDeferred: true,
      nextEligibleAt,
      previousExecutionId: executionId,
    });
  }

  // ── Construir nueva idempotencyKey (HALLAZGO 3: validación de longitud) ───

  let newIdempotencyKey: IdempotencyKey;
  if (input.idempotencyKey) {
    // Sanitizar: eliminar caracteres de control, trim
    const sanitized = sanitizeIdempotencyKeyRaw(input.idempotencyKey);
    if (sanitized.length === 0) {
      return err({
        code: 'VALIDATION_ERROR' as const,
        message: 'idempotencyKey inválida para retry: no puede estar vacía tras sanitización',
      });
    }
    if (sanitized.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      return err({
        code: 'VALIDATION_ERROR' as const,
        message: `idempotencyKey excede el límite de ${MAX_IDEMPOTENCY_KEY_LENGTH} caracteres`,
      });
    }
    newIdempotencyKey = idempotencyKeyFromString(sanitized);
  } else {
    // Derivar clave determinística — siempre la misma para el mismo intento
    const rawBase = sanitizeIdempotencyKeyRaw(String(previous.idempotencyKey));
    const raw = `${rawBase}:retry:${newAttempt}`;
    if (raw.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      return err({
        code: 'VALIDATION_ERROR' as const,
        message: `La idempotencyKey derivada para retry excede el límite de ${MAX_IDEMPOTENCY_KEY_LENGTH} caracteres`,
      });
    }
    newIdempotencyKey = idempotencyKeyFromString(raw);
  }

  // ── Loguear: retry solicitado ─────────────────────────────────────────────

  await logSilently(deps.executionLogRepository, {
    executionId,
    organizationId,
    level: 'info',
    event: 'execution.retry_requested',
    message: `Retry requested by ${requestedBy} (attempt ${newAttempt}/${maxAttempts})`,
    context: {
      automationId: String(previous.automationId),
      previousAttempt: previous.attempt,
      newAttempt,
      requestedBy,
      backoffMs: delayMs,
    },
  }, deps.logger);

  // ── Crear nueva ejecución ─────────────────────────────────────────────────

  const newMetadata: Record<string, unknown> = {
    previousExecutionId: String(previous.id),
    retryRequestedBy: requestedBy,
    ...(previous.inputMetadata ?? {}),
  };

  const createResult = await deps.executionRepository.create({
    organizationId,
    automationId: previous.automationId,
    clientId: previous.clientId,
    idempotencyKey: newIdempotencyKey,
    triggeredBy: requestedBy,
    triggerType: previous.triggerType,
    attempt: newAttempt,
    inputMetadata: newMetadata,
  });

  if (isErr(createResult)) {
    // HALLAZGO 3: Recuperar de CONFLICT (23505) — retry concurrente
    if (createResult.error.code === 'CONFLICT') {
      deps.logger.info('retryAutomationExecution: concurrent retry detected — recovering existing execution', {
        organizationId,
        idempotencyKey: String(newIdempotencyKey),
      });

      const existingResult = await deps.executionRepository.findByIdempotencyKey(
        newIdempotencyKey,
        organizationId,
      );

      if (isOk(existingResult) && existingResult.value !== null) {
        const existing = existingResult.value;
        return ok({
          retryDeferred: false,
          execution: existing,
          previousExecutionId: executionId,
          attempt: existing.attempt,
          dispatched: false,
          nextEligibleAt: null,
        });
      }
    }

    deps.logger.error('retryAutomationExecution: error al crear nueva ejecución', createResult.error);
    return createResult;
  }

  const newExecution = createResult.value;

  // ── Loguear: retry creado ─────────────────────────────────────────────────

  await logSilently(deps.executionLogRepository, {
    executionId: newExecution.id,
    organizationId,
    level: 'info',
    event: 'execution.retry_created',
    message: `Retry execution created (attempt ${newAttempt})`,
    context: {
      automationId: String(previous.automationId),
      previousExecutionId: String(previous.id),
      attempt: newAttempt,
    },
  }, deps.logger);

  // ── Despachar ─────────────────────────────────────────────────────────────

  let dispatched = false;

  const dispatchResult = await deps.dispatcher.dispatch(previous.automationId, {
    idempotencyKey: String(newIdempotencyKey),
    payload: {
      executionId: String(newExecution.id),
      organizationId: String(organizationId),
      clientId: previous.clientId ? String(previous.clientId) : null,
      triggerType: previous.triggerType,
      callbackUrl: '',
      metadata: {
        previousExecutionId: String(previous.id),
        attempt: newAttempt,
      },
    },
  });

  if (isOk(dispatchResult)) {
    dispatched = true;
    await logSilently(deps.executionLogRepository, {
      executionId: newExecution.id,
      organizationId,
      level: 'info',
      event: 'execution.dispatched',
      message: 'Retry execution dispatched successfully',
      context: {
        automationId: String(previous.automationId),
        attempt: newAttempt,
        externalRunId: dispatchResult.value.externalRunId ?? null,
      },
    }, deps.logger);
  } else {
    deps.logger.warn('retryAutomationExecution: dispatch failed, marking as failed', {
      executionId: newExecution.id,
    });
    await deps.executionRepository.updateStatus(newExecution.id, organizationId, {
      status: 'failed',
      completedAt: new Date(),
      errorCode: 'DISPATCH_FAILED',
      errorMessage: 'Retry dispatch to workflow engine failed.',
    });
    await logSilently(deps.executionLogRepository, {
      executionId: newExecution.id,
      organizationId,
      level: 'error',
      event: 'execution.dispatch_failed',
      message: 'Retry execution dispatch failed',
      context: { automationId: String(previous.automationId), attempt: newAttempt },
    }, deps.logger);
  }

  deps.logger.info('retryAutomationExecution: ok', {
    organizationId,
    previousExecutionId: executionId,
    newExecutionId: newExecution.id,
    attempt: newAttempt,
    dispatched,
  });

  return ok({
    retryDeferred: false,
    execution: newExecution,
    previousExecutionId: executionId,
    attempt: newAttempt,
    dispatched,
    nextEligibleAt: null,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calcula el delay de backoff exponencial.
 * attempt=1 → primer intento (sin backoff).
 * attempt=2 → primer retry (con backoff inicial).
 */
function computeBackoffDelay(
  attempt: number,
  policy: { initialDelayMs: number; backoffMultiplier: number; maxDelayMs: number },
): number {
  if (attempt <= 1) return 0;
  const delay = policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attempt - 2);
  return Math.min(delay, policy.maxDelayMs);
}

/**
 * Sanitiza el valor raw de una idempotencyKey:
 * - Elimina caracteres de control (0x00-0x1F, 0x7F).
 * - Trim de espacios.
 */
function sanitizeIdempotencyKeyRaw(raw: string): string {
  return raw.replace(/[\x00-\x1F\x7F]/g, '').trim();
}

async function logSilently(
  repo: ExecutionLogRepository,
  input: Parameters<ExecutionLogRepository['log']>[0],
  logger: LoggerPort,
): Promise<void> {
  try {
    await repo.log(input);
  } catch (e) {
    logger.warn('retryAutomationExecution: log failed silently', { error: String(e) });
  }
}
