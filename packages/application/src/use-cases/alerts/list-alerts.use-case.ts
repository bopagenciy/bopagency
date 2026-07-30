import { ok } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Alert, AlertRepository } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type ListAlertsInput = {
  pagination: PaginationParams;
};

export type ListAlertsDeps = {
  alertRepository: AlertRepository;
  logger: LoggerPort;
};

export async function listAlerts(
  input: ListAlertsInput,
  deps: ListAlertsDeps,
): Promise<Result<PaginatedResult<Alert>>> {
  deps.logger.debug('listAlerts');

  const result = await deps.alertRepository.findOpen(input.pagination);
  return ok(result);
}
