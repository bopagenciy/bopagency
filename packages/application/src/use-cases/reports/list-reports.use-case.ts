import { ok } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Report, ReportRepository } from '@bop-agency/domain';
import type { ClientId } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type ListReportsInput = {
  clientId: ClientId;
  pagination: PaginationParams;
};

export type ListReportsDeps = {
  reportRepository: ReportRepository;
  logger: LoggerPort;
};

export async function listReports(
  input: ListReportsInput,
  deps: ListReportsDeps,
): Promise<Result<PaginatedResult<Report>>> {
  deps.logger.debug('listReports', { clientId: input.clientId });

  const result = await deps.reportRepository.findByClient(input.clientId, input.pagination);
  return ok(result);
}
