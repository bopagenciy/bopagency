/**
 * cancelAutomationExecution — Cancela una ejecución desde el estado elegible.
 *
 * REGLAS (HALLAZGO 2 — Phase 6D correctivo):
 *
 * queued  → cancelled localmente (sin dispatcher externo).
 * running → REQUIERE cancelación remota confirmada vía dispatcher.cancel():
 *   - dispatcher ausente       → CANCEL_NOT_SUPPORTED (ejecución permanece running)
 *   - cancel remoto ok         → cancelled localmente
 *   - cancel remoto falla/timeout → error seguro devuelto al caller,
 *                                   ejecución permanece en running
 * cancelled → idempotente (ok sin actualizar).
 * succeeded, failed, retrying → rechazados con VALIDATION_ERROR.
 *
 * GARANTÍA: nunca se marca running como cancelled sin confirmación externa.
 *
 * AISLAMIENTO:
 * - Siempre busca por (organizationId, executionId).
 * - No revela si la ejecución existe en otra organización.
 *
 * SEGURIDAD:
 * - No usa service_role.
 * - reason se sanitiza (truncado, sin caracteres de control).
 */

import { ok, err, isErr, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  AutomationExecutionId,
  AutomationExecution,
  OrganizationId,
  AutomationExecutionRepository,
  ExecutionLogRepository,
} from '@bop-agency/domain';
import {
  canCancelExecution,
  cancelNotAllowed,
  cancelNotSupported,
  cancelRemoteFailed,
} from '@bop-agency/domain';
import type { WorkflowDispatcherPort } from '../../ports/workflow-dispatcher.port';
import type { LoggerPort } from '../../ports/logger.port';

// ─── Input / Output ───────────────────────────────────────────────────────────

export type CancelAutomationExecutionInput = {
  readonly organizationId: OrganizationId;
  readonly executionId: AutomationExecutionId;
  /** UserId o nombre del sistema que solicita la cancelación. */
  readonly requestedBy: string;
  /** Razón opcional. Sanitizada antes de persistir (truncada a 255 chars). */
  readonly reason?: string;
};

export type CancelAutomationExecutionDeps = {
  executionRepository: AutomationExecutionRepository;
  executionLogRepository: ExecutionLogRepository;
  /** Opcional — necesario para cancelar ejecuciones en estado 'running'. */
  dispatcher?: WorkflowDispatcherPort;
  logger: LoggerPort;
};

// ─── Use case ─────────────────────────────────────────────────────────────────

export async function cancelAutomationExecution(
  input: CancelAutomationExecutionInput,
  deps: CancelAutomationExecutionDeps,
): Promise<Result<AutomationExecution>> {
  const { organizationId, executionId, requestedBy } = input;
  const safeReason = sanitizeReason(input.reason);

  deps.logger.debug('cancelAutomationExecution: begin', { organizationId, executionId, requestedBy });

  // ── Cargar ejecución (verifica org ownership) ─────────────────────────────

  const execResult = await deps.executionRepository.findById(executionId, organizationId);
  if (isErr(execResult)) {
    return execResult;
  }

  const execution = execResult.value;

  // ── Idempotencia: ya cancelada ────────────────────────────────────────────

  if (execution.status === 'cancelled') {
    deps.logger.info('cancelAutomationExecution: idempotent — already cancelled', {
      organizationId,
      executionId,
    });
    return ok(execution);
  }

  // ── Verificar si el estado permite cancelación ────────────────────────────

  if (!canCancelExecution(execution.status)) {
    return err(cancelNotAllowed(execution.status));
  }

  // ── Cancelación para ejecuciones 'running' ────────────────────────────────
  // HALLAZGO 2: Solo se cancela localmente tras confirmación remota.
  // Nunca se asume cancelación exitosa si el gateway no lo confirma.

  if (execution.status === 'running') {
    if (!deps.dispatcher) {
      // No hay gateway — no se puede cancelar running de forma segura
      deps.logger.warn('cancelAutomationExecution: no dispatcher available for running execution — cannot cancel', {
        organizationId,
        executionId,
      });
      return err(cancelNotSupported());
    }

    const externalCancelResult = await deps.dispatcher.cancel(String(executionId));

    if (!isOk(externalCancelResult)) {
      // Fallo remoto (incluyendo timeout, not-supported, gateway down)
      // Ejecución permanece en running — no se marca como cancelled
      deps.logger.warn('cancelAutomationExecution: remote cancel failed — execution remains running', {
        organizationId,
        executionId,
        errorCode: externalCancelResult.error.code,
      });
      return err(cancelRemoteFailed(externalCancelResult.error.message));
    }

    deps.logger.info('cancelAutomationExecution: remote cancel confirmed', {
      organizationId,
      executionId,
    });
    // Confirmed — fall through to local update
  }

  // ── Actualizar estado a 'cancelled' ───────────────────────────────────────

  const updateResult = await deps.executionRepository.updateStatus(
    executionId,
    organizationId,
    {
      status: 'cancelled',
      completedAt: new Date(),
      errorCode: null,
      errorMessage: safeReason
        ? `Cancelled by ${requestedBy}: ${safeReason}`
        : `Cancelled by ${requestedBy}`,
    },
  );

  if (isErr(updateResult)) {
    deps.logger.error('cancelAutomationExecution: update failed', updateResult.error);
    return updateResult;
  }

  // ── Log ───────────────────────────────────────────────────────────────────

  await logSilently(deps.executionLogRepository, {
    executionId,
    organizationId,
    level: 'info',
    event: 'execution.cancelled',
    message: `Execution cancelled by ${requestedBy}`,
    context: {
      previousStatus: execution.status,
      requestedBy,
      ...(safeReason && { reason: safeReason }),
    },
  }, deps.logger);

  deps.logger.info('cancelAutomationExecution: ok', {
    organizationId,
    executionId,
    previousStatus: execution.status,
    requestedBy,
  });

  return ok(updateResult.value);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sanitiza la razón de cancelación: trunca y elimina caracteres de control. */
function sanitizeReason(reason?: string): string | undefined {
  if (!reason) return undefined;
  return reason
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .trim()
    .slice(0, 255);
}

async function logSilently(
  repo: ExecutionLogRepository,
  input: Parameters<ExecutionLogRepository['log']>[0],
  logger: LoggerPort,
): Promise<void> {
  try {
    await repo.log(input);
  } catch (e) {
    logger.warn('cancelAutomationExecution: log failed silently', { error: String(e) });
  }
}
