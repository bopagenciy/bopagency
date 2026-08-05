/**
 * AutomationExecutionRepository — contrato de dominio para la tabla
 * `public.automation_executions` (creada en Phase 6B).
 *
 * Phase 6A: interfaz inicial.
 * Phase 6F: añadido listStuckCandidates para evaluación de ejecuciones atascadas.
 *
 * Reglas de seguridad:
 * - organizationId requerido en todas las firmas.
 * - No se almacenan secretos ni payloads sin sanitizar.
 *   Los campos `inputMetadata`/`outputMetadata` del entity deben
 *   ser sanitizados por el adaptador antes de persistir.
 * - `findByIdempotencyKey` recibe organizationId para evitar
 *   cross-tenant key collision.
 */

import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  AutomationExecution,
  AutomationExecutionId,
  AutomationExecutionFilter,
  AutomationExecutionStatus,
  IdempotencyKey,
} from '../entities/automation-execution';
import type { AutomationId } from '../entities/automation';
import type { OrganizationId } from '../entities/organization';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AutomationExecutionCountByStatus = {
  readonly queued: number;
  readonly running: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly retrying: number;
};

export type CreateExecutionInput = {
  readonly organizationId: OrganizationId;
  readonly automationId: AutomationId;
  readonly clientId?: AutomationExecution['clientId'];
  readonly idempotencyKey: IdempotencyKey;
  readonly triggeredBy: string;
  readonly triggerType: AutomationExecution['triggerType'];
  readonly attempt: number;
  readonly inputMetadata?: Record<string, unknown>;
};

export type UpdateExecutionStatusInput = {
  readonly status: AutomationExecutionStatus;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly outputMetadata?: Record<string, unknown> | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
};

// ─── Repository interface ─────────────────────────────────────────────────────

export interface AutomationExecutionRepository {
  /**
   * Crea una nueva ejecución con status inicial 'queued'.
   * Falla con CONFLICT si ya existe una ejecución con la misma idempotencyKey
   * en la misma organización (deduplicación).
   */
  create(input: CreateExecutionInput): Promise<Result<AutomationExecution>>;

  /**
   * Actualiza el status y campos de auditoría de una ejecución.
   * Verifica que pertenezca a organizationId antes de modificar.
   */
  updateStatus(
    id: AutomationExecutionId,
    organizationId: OrganizationId,
    data: UpdateExecutionStatusInput,
  ): Promise<Result<AutomationExecution>>;

  /**
   * Busca una ejecución por ID.
   * Requiere organizationId para aislamiento multi-tenant.
   */
  findById(
    id: AutomationExecutionId,
    organizationId: OrganizationId,
  ): Promise<Result<AutomationExecution>>;

  /**
   * Busca una ejecución por su clave de idempotencia.
   * Retorna null (no error) si no existe — usado para deduplicación.
   */
  findByIdempotencyKey(
    key: IdempotencyKey,
    organizationId: OrganizationId,
  ): Promise<Result<AutomationExecution | null>>;

  /**
   * Lista ejecuciones de una automatización específica.
   */
  findByAutomation(
    automationId: AutomationId,
    organizationId: OrganizationId,
    filters: { status?: AutomationExecutionStatus },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<AutomationExecution>>;

  /**
   * Lista ejecuciones de toda la organización con filtros opcionales.
   */
  findByOrganization(
    filter: AutomationExecutionFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<AutomationExecution>>;

  /**
   * Cuenta ejecuciones agrupadas por status.
   */
  countByStatus(
    organizationId: OrganizationId,
    automationId?: AutomationId,
  ): Promise<Result<AutomationExecutionCountByStatus>>;

  // ── Phase 6F: Stuck execution detection ──────────────────────────────────────

  /**
   * Lista ejecuciones en estado queued/running cuya fecha de inicio o encolado
   * sea anterior a `olderThan`. Usado por EvaluateStuckAutomationExecutionsUseCase.
   *
   * - Para 'queued': compara queuedAt < olderThan.
   * - Para 'running': compara startedAt < olderThan (fallback a queuedAt si null).
   * - Requiere organizationId para aislamiento multi-tenant.
   * - Soporta paginación para procesar grandes volúmenes sin N+1.
   */
  listStuckCandidates(
    organizationId: OrganizationId,
    statuses: ('queued' | 'running')[],
    olderThan: Date,
    pageSize: number,
    page?: number,
  ): Promise<PaginatedResult<AutomationExecution>>;
}
