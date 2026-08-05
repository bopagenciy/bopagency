/**
 * listAutomations — use case de listado de automatizaciones.
 *
 * Phase 6A: organizationId ahora es OBLIGATORIO en el input.
 * El repositorio delega el filtrado multi-tenant.
 */

import { ok } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Automation, AutomationStatus, AutomationFilter } from '@bop-agency/domain';
import type { AutomationRepository } from '@bop-agency/domain';
import type { OrganizationId, ClientId } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type ListAutomationsInput = {
  readonly organizationId: OrganizationId;
  readonly clientId?: ClientId;
  readonly status?: AutomationStatus;
  readonly pagination: PaginationParams;
};

export type ListAutomationsDeps = {
  automationRepository: AutomationRepository;
  logger: LoggerPort;
};

export async function listAutomations(
  input: ListAutomationsInput,
  deps: ListAutomationsDeps,
): Promise<Result<PaginatedResult<Automation>>> {
  deps.logger.debug('listAutomations', {
    organizationId: input.organizationId,
    clientId: input.clientId,
    status: input.status,
  });

  const filter: AutomationFilter = {
    organizationId: input.organizationId,
    ...(input.clientId && { clientId: input.clientId }),
    ...(input.status && { status: input.status }),
  };

  const result = await deps.automationRepository.findByOrganization(filter, input.pagination);
  return ok(result);
}
