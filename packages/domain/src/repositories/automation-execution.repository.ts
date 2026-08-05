/**
 * AutomationExecutionRepository — contrato de dominio para la tabla
 * `public.automation_executions` (a crear en Phase 6B).
 *
 * Phase 6A — nueva interfaz.
 *
 * Reglas de seguridad:
 * - organizationId requerido en todas las firmas.
 * - No se almacenan secretos ni payloads sin sanitizar.
 *   Los campos `inputMetadata`/`outputMetadata` del entity deben
 *   ser sanitizados por el adaptador antes de persistir.
 * - `getByIdempotencyKey` recibe organizationId para evitar
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
   * Falla si ya existe una ejecución con la misma idempotencyKey
   * en la misma organización (deduplicación).
   */
  create(
    input: CreateExecutionInput,
  ): Promise<Result<AutomationExecution>>;

  /**
   * Actualiza el status y campos de auditoría de una ejecución.
   * Verifica que pertenezca a organizationId antes de modificar.
   * No valida transiciones — esa responsabilidad es del use case.
   */
  updateStatus(
    id: AutomationExecutionId,
    organizationId: OrganizationId,
    data: UpdateExecutionStatusInput,
  ): Promise<Result<AutomationExecution>>;

  /**
   * Busca una ejecución por ID.
   * Requiere organizationId para aislamiento multi-tenant.
   * Retorna NOT_FOUND si no existe o no pertenece a la organización.
   */
  findById(
    id: AutomationExecutionId,
    organizationId: OrganizationId,
  ): Promise<Result<AutomationExecution>>;

  /**
   * Busca una ejecución por su clave de idempotencia.
   * Retorna null (no error) si no existe — usado para deduplicación.
   * Requiere organizationId para no filtrar a través de tenants.
   */
  findByIdempotencyKey(
    key: IdempotencyKey,
    organizationId: OrganizationId,
  ): Promise<Result<AutomationExecution | null>>;

  /**
   * Lista ejecuciones de una automatización específica.
   * Requiere automationId + organizationId.
   * Ordenadas por queuedAt DESC por defecto.
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
   * Opcionalmente filtrado por automationId.
   * Usado en KPIs de dashboard y health checks.
   */
  countByStatus(
    organizationId: OrganizationId,
    automationId?: AutomationId,
  ): Promise<Result<AutomationExecutionCountByStatus>>;
}
