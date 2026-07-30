import { ok } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Client, ClientFilter, ClientRepository } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type ListClientsInput = {
  filter: ClientFilter;
  pagination: PaginationParams;
};

export type ListClientsDeps = {
  clientRepository: ClientRepository;
  logger: LoggerPort;
};

export async function listClients(
  input: ListClientsInput,
  deps: ListClientsDeps,
): Promise<Result<PaginatedResult<Client>>> {
  deps.logger.debug('listClients', { filter: input.filter, pagination: input.pagination });

  const result = await deps.clientRepository.findAll(input.filter, input.pagination);
  return ok(result);
}
