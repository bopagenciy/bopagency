/**
 * ExecutionLogRepository — contrato de dominio para la tabla
 * `public.automation_execution_logs` (creada en Phase 6B).
 *
 * Phase 6D — nueva interfaz.
 *
 * Reglas de seguridad:
 * - organizationId requerido en todas las operaciones.
 * - No se persiste payload crudo, HMAC, API keys, ni stack traces.
 * - El campo `context` debe ser sanitizado por el adaptador.
 * - Los mensajes son orientados al consumidor (no técnicos de infraestructura).
 */

import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { AutomationExecutionId } from '../entities/automation-execution';
import type { OrganizationId } from '../entities/organization';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExecutionLogLevel = 'info' | 'warn' | 'error';

export type ExecutionLogEventType =
  | 'execution.queued'
  | 'execution.dispatched'
  | 'execution.dispatch_failed'
  | 'execution.cancelled'
  | 'execution.retry_requested'
  | 'execution.retry_created'
  | 'execution.retry_deferred';

export type CreateExecutionLogInput = {
  readonly executionId: AutomationExecutionId;
  readonly organizationId: OrganizationId;
  readonly level: ExecutionLogLevel;
  readonly event: ExecutionLogEventType;
  readonly message: string;
  /**
   * Contexto sanitizado — sin secretos, HMAC, tokens, ni PII.
   * El adaptador debe filtrar claves prohibidas antes de persistir.
   */
  readonly context?: Record<string, unknown>;
};

export type ExecutionLog = {
  readonly id: string;
  readonly executionId: AutomationExecutionId;
  readonly organizationId: OrganizationId;
  readonly level: ExecutionLogLevel;
  readonly event: ExecutionLogEventType;
  readonly message: string;
  readonly context: Record<string, unknown>;
  readonly occurredAt: Date;
};

// ─── Repository interface ─────────────────────────────────────────────────────

export interface ExecutionLogRepository {
  /**
   * Registra un evento de ejecución sanitizado.
   * No persiste secretos ni datos personales innecesarios.
   * Idempotente: si el log falla, no debe interrumpir el flujo principal.
   */
  log(input: CreateExecutionLogInput): Promise<Result<void>>;

  /**
   * Lista logs de una ejecución específica.
   * Requiere organizationId para aislamiento multi-tenant.
   */
  findByExecution(
    executionId: AutomationExecutionId,
    organizationId: OrganizationId,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ExecutionLog>>;
}
