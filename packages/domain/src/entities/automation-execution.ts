/**
 * AutomationExecution — entidad de dominio para la tabla
 * `public.automation_executions` (a crear en Phase 6B).
 *
 * Phase 6A — nueva entidad.
 *
 * Estados de ejecución y sus transiciones:
 *
 * | Desde     | Hacia              | Descripción                            |
 * |-----------|--------------------|-----------------------------------------|
 * | queued    | running            | El dispatcher tomó la ejecución         |
 * | queued    | cancelled          | Cancelación antes de comenzar           |
 * | running   | succeeded          | Completó exitosamente                   |
 * | running   | failed             | Error en la ejecución                   |
 * | running   | cancelled          | Cancelación durante ejecución           |
 * | failed    | retrying           | Se programó un reintento                |
 * | retrying  | queued             | Reintento encolado (nueva ejecución)    |
 * | succeeded | (ninguno)          | Estado terminal                         |
 * | failed    | (ninguno)          | Terminal sin retrying                   |
 * | cancelled | (ninguno)          | Estado terminal                         |
 *
 * Restricciones de seguridad:
 * - inputMetadata y outputMetadata son opacas (Record<string, unknown>).
 *   El adaptador de infraestructura debe sanitizarlas antes de persistir.
 * - errorMessage es un string de solo diagnóstico; no debe contener
 *   secretos, tokens, ni PII.
 * - idempotencyKey asegura que no se creen dos ejecuciones del mismo
 *   disparador en el mismo contexto.
 *
 * Frontera domain / automation-engine:
 * - Domain define el TYPE `IdempotencyKey` (valor validado, opaco).
 * - automation-engine define el GENERADOR `idempotencyKey()` (función pura).
 * - Los tipos son estructuralmente compatibles (mismo brand literal).
 * - No existe dependencia circular.
 */

import type { OrganizationId } from './organization';
import type { ClientId } from './client';
import type { AutomationId } from './automation';

// ─── Branded IDs ──────────────────────────────────────────────────────────────

export type AutomationExecutionId = string & { readonly _brand: 'AutomationExecutionId' };

export function automationExecutionId(id: string): AutomationExecutionId {
  if (!id || id.trim().length === 0) {
    throw new Error('AutomationExecutionId cannot be empty');
  }
  return id as AutomationExecutionId;
}

/**
 * IdempotencyKey en el dominio.
 *
 * Domain conserva el VALOR validado; automation-engine genera la CLAVE.
 * El brand 'IdempotencyKey' es idéntico al usado en automation-engine
 * para garantizar compatibilidad estructural en TypeScript sin import
 * circular.
 */
export type IdempotencyKey = string & { readonly _brand: 'IdempotencyKey' };

export function idempotencyKeyFromString(raw: string): IdempotencyKey {
  if (!raw || raw.trim().length === 0) {
    throw new Error('IdempotencyKey cannot be empty');
  }
  return raw as IdempotencyKey;
}

// ─── AutomationExecutionStatus ────────────────────────────────────────────────

export type AutomationExecutionStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'retrying';

// Justificación: `timed_out` no se incluye en Phase 6A.
// Racional: timeout es detectado por el n8n dispatcher como un error con
// código específico, y se representa como `failed` con errorCode='TIMEOUT'.
// Si Phase 6C/6D demuestra que se necesita un estado diferenciado para
// reintentar solo timeouts, se añade en Phase 6D junto con la lógica de
// dispatch. Documentado como riesgo pendiente.

// ─── TriggerType ──────────────────────────────────────────────────────────────

export type AutomationTriggerType = 'schedule' | 'webhook' | 'event' | 'manual';

// ─── AutomationExecution entity ───────────────────────────────────────────────

export type AutomationExecution = {
  readonly id: AutomationExecutionId;
  readonly organizationId: OrganizationId;
  readonly automationId: AutomationId;
  /** Null si la automatización es global (no vinculada a cliente). */
  readonly clientId: ClientId | null;
  readonly status: AutomationExecutionStatus;
  /**
   * Número del intento actual (1-based).
   * attempt === 1 → primer intento.
   * attempt > 1  → reintento.
   * Nunca menor que 1.
   */
  readonly attempt: number;
  /**
   * Clave de idempotencia para deduplicar disparos del mismo trigger
   * en el mismo contexto temporal.
   */
  readonly idempotencyKey: IdempotencyKey;
  /** UserId o nombre del sistema que disparó la ejecución. */
  readonly triggeredBy: string;
  readonly triggerType: AutomationTriggerType;
  /**
   * Metadatos de entrada sanitizados.
   * El adaptador debe eliminar secretos/PII antes de persistir.
   */
  readonly inputMetadata: Record<string, unknown>;
  /**
   * Metadatos de salida sanitizados.
   * El adaptador debe eliminar secretos/PII antes de persistir.
   * Null hasta que la ejecución complete.
   */
  readonly outputMetadata: Record<string, unknown> | null;
  /** Código de error estructurado. Null si no hubo error. */
  readonly errorCode: string | null;
  /**
   * Mensaje de error para diagnóstico. Sanitizado (sin secretos).
   * Null si no hubo error.
   */
  readonly errorMessage: string | null;
  readonly queuedAt: Date;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

// ─── AutomationExecutionFilter ────────────────────────────────────────────────

export type AutomationExecutionFilter = {
  readonly organizationId: OrganizationId;
  readonly automationId?: AutomationId;
  readonly clientId?: ClientId;
  readonly status?: AutomationExecutionStatus;
};

// ─── Transition rules ─────────────────────────────────────────────────────────

const EXECUTION_TRANSITIONS: Record<AutomationExecutionStatus, AutomationExecutionStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['succeeded', 'failed', 'cancelled'],
  failed: ['retrying'],
  retrying: ['queued'],
  succeeded: [], // terminal
  cancelled: [], // terminal
};

/**
 * Retorna `true` si la transición de `from` a `to` es válida.
 *
 * Restricciones explícitas:
 * - succeeded → running: bloqueado (no se re-ejecuta lo exitoso directamente)
 * - cancelled → running: bloqueado
 * - failed → running: bloqueado directamente (debe pasar por retrying → queued)
 */
export function canTransitionExecution(
  from: AutomationExecutionStatus,
  to: AutomationExecutionStatus,
): boolean {
  return EXECUTION_TRANSITIONS[from].includes(to);
}

/**
 * Retorna los estados válidos desde `status`.
 */
export function getExecutionNextStates(
  status: AutomationExecutionStatus,
): AutomationExecutionStatus[] {
  return [...EXECUTION_TRANSITIONS[status]];
}

/**
 * Retorna `true` si el estado es terminal (no hay transiciones salientes).
 */
export function isExecutionTerminal(status: AutomationExecutionStatus): boolean {
  return EXECUTION_TRANSITIONS[status].length === 0;
}

/**
 * Retorna `true` si la ejecución puede ser reintentada.
 *
 * Condiciones:
 * - Estado debe ser `failed`.
 * - `attempt` debe ser menor que `maxAttempts`.
 */
export function canRetryExecution(
  execution: Pick<AutomationExecution, 'status' | 'attempt'>,
  maxAttempts: number,
): boolean {
  if (execution.status !== 'failed') return false;
  if (execution.attempt < 1) return false;
  return execution.attempt < maxAttempts;
}

/**
 * Retorna `true` si la ejecución puede ser cancelada.
 *
 * Solo se puede cancelar desde `queued` o `running`.
 */
export function canCancelExecution(status: AutomationExecutionStatus): boolean {
  return canTransitionExecution(status, 'cancelled');
}

// ─── Validation helpers ───────────────────────────────────────────────────────

/**
 * Valida que los campos de fecha de una ejecución sean coherentes.
 * Retorna el primer mensaje de error o null si es válido.
 */
export function validateExecutionDates(
  execution: Pick<AutomationExecution, 'queuedAt' | 'startedAt' | 'completedAt'>,
): string | null {
  const { queuedAt, startedAt, completedAt } = execution;

  if (startedAt && startedAt < queuedAt) {
    return 'startedAt cannot be before queuedAt';
  }
  if (completedAt && !startedAt) {
    return 'completedAt requires startedAt to be set';
  }
  if (completedAt && startedAt && completedAt < startedAt) {
    return 'completedAt cannot be before startedAt';
  }
  return null;
}

/**
 * Valida que el número de intento sea válido.
 */
export function isValidAttemptNumber(attempt: number): boolean {
  return Number.isInteger(attempt) && attempt >= 1;
}
