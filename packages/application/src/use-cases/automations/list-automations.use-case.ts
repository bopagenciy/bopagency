import { ok } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Automation, AutomationRepository } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type ListAutomationsInput = {
  pagination: PaginationParams;
};

export type ListAutomationsDeps = {
  automationRepository: AutomationRepository;
  logger: LoggerPort;
};

export async function listAutomations(
  input: ListAutomationsInput,
  deps: ListAutomationsDeps,
): Promise<Result<PaginatedResult<Automation>>> {
  deps.logger.debug('listAutomations');

  const result = await deps.automationRepository.findAll(input.pagination);
  return ok(result);
}
