import { err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { ClientId, ClientRepository, ClientWithDocuments } from '@bop-agency/domain';
import { clientNotFound } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type GetClientWithDocumentsInput = {
  readonly clientId: ClientId;
  readonly organizationId: OrganizationId;
};

export type GetClientWithDocumentsDeps = {
  clientRepository: ClientRepository;
  logger: LoggerPort;
};

export async function getClientWithDocuments(
  input: GetClientWithDocumentsInput,
  deps: GetClientWithDocumentsDeps,
): Promise<Result<ClientWithDocuments>> {
  deps.logger.debug('getClientWithDocuments', { clientId: input.clientId });

  const result = await deps.clientRepository.findByIdWithDocuments(
    input.clientId,
    input.organizationId,
  );

  if (!isOk(result)) {
    return err(clientNotFound(input.clientId));
  }

  return result;
}
