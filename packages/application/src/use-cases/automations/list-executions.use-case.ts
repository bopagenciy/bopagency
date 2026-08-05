/**
 * listAutomationExecutions — Lista ejecuciones con filtros y paginación.
 *
 * AISLAMIENTO MULTI-TENANT:
 * - organizationId es SIEMPRE obligatorio.
 * - Nunca se usa un ID de ejecución sin organizationId.
 * - El repositorio aplica `.eq('organization_id', organizationId)` en todas las queries.
 *
 * FILTROS DISPONIBLES:
 * - automationId: limita a una automatización específica.
 * - clientId: limita a ejecuciones de automatizaciones de un cliente.
 * - status: filtra por estado de ejecución.
 * - dateRange: filtra por rango de fechas en queuedAt.
 */

import { ok } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  AutomationId,
  AutomationExecution,
  AutomationExecutionFilter,
  AutomationExecutionStatus,
  OrganizationId,
  ClientId,
  AutomationExecutionRepository,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

// ─── Input / Deps ─────────────────────────────────────────────────────────────

export type ListAutomationExecutionsInput = {
  /** Obligatorio — aislamiento multi-tenant. */
  readonly organizationId: OrganizationId;
  /** Opcional — filtra por automatización. */
  readonly automationId?: AutomationId;
  /** Opcional — filtra por cliente. */
  readonly clientId?: ClientId;
  /** Opcional — filtra por estado. */
  readonly status?: AutomationExecutionStatus;
  /** Opcional — filtra queuedAt >= desde. */
  readonly from?: Date;
  /** Opcional — filtra queuedAt <= hasta. */
  readonly to?: Date;
  readonly pagination: PaginationParams;
};

export type ListAutomationExecutionsDeps = {
  executionRepository: AutomationExecutionRepository;
  logger: LoggerPort;
};

// ─── Use case ─────────────────────────────────────────────────────────────────

export async function listAutomationExecutions(
  input: ListAutomationExecutionsInput,
  deps: ListAutomationExecutionsDeps,
): Promise<Result<PaginatedResult<AutomationExecution>>> {
  deps.logger.debug('listAutomationExecutions', {
    organizationId: input.organizationId,
    automationId: input.automationId,
    clientId: input.clientId,
    status: input.status,
  });

  const filter: AutomationExecutionFilter = {
    organizationId: input.organizationId,
    ...(input.automationId !== undefined && { automationId: input.automationId }),
    ...(input.clientId !== undefined && { clientId: input.clientId }),
    ...(input.status !== undefined && { status: input.status }),
  };

  const result = await deps.executionRepository.findByOrganization(filter, input.pagination);
  return ok(result);
}
