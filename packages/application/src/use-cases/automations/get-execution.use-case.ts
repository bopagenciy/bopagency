/**
 * getAutomationExecution — Obtiene una ejecución por ID.
 *
 * Siempre requiere organizationId para aislamiento multi-tenant.
 * Retorna NOT_FOUND si no existe o no pertenece a la organización.
 */


import type { Result } from '@bop-agency/shared';
import type {
  AutomationExecutionId,
  AutomationExecution,
  OrganizationId,
  AutomationExecutionRepository,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

// ─── Input / Deps ─────────────────────────────────────────────────────────────

export type GetAutomationExecutionInput = {
  readonly organizationId: OrganizationId;
  readonly executionId: AutomationExecutionId;
};

export type GetAutomationExecutionDeps = {
  executionRepository: AutomationExecutionRepository;
  logger: LoggerPort;
};

// ─── Use case ─────────────────────────────────────────────────────────────────

export async function getAutomationExecution(
  input: GetAutomationExecutionInput,
  deps: GetAutomationExecutionDeps,
): Promise<Result<AutomationExecution>> {
  deps.logger.debug('getAutomationExecution', {
    organizationId: input.organizationId,
    executionId: input.executionId,
  });

  return deps.executionRepository.findById(input.executionId, input.organizationId);
}
