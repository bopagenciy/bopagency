import { isOk, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { Client, ClientId, ClientRepository } from '@bop-agency/domain';
import { clientNotFound } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type GetClientInput = {
  clientId: ClientId;
  organizationId: OrganizationId;
};

export type GetClientDeps = {
  clientRepository: ClientRepository;
  logger: LoggerPort;
};

export async function getClient(
  input: GetClientInput,
  deps: GetClientDeps,
): Promise<Result<Client>> {
  deps.logger.debug('getClient', { clientId: input.clientId });

  const result = await deps.clientRepository.findById(input.clientId, input.organizationId);

  if (!isOk(result)) {
    return err(clientNotFound(input.clientId));
  }

  return result;
}
