import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { Client, ClientId, ClientRepository } from '@bop-agency/domain';
import { clientNotFound, clientDeleted, insufficientRole } from '@bop-agency/domain';
import type { OrganizationId, OrganizationRole } from '@bop-agency/domain';
import { hasMinimumRole } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type SoftDeleteClientInput = {
  readonly clientId: ClientId;
  readonly organizationId: OrganizationId;
  readonly deletedBy: string;
  /** Role of the user performing the deletion — must be admin or owner. */
  readonly callerRole: OrganizationRole;
};

export type SoftDeleteClientDeps = {
  clientRepository: ClientRepository;
  logger: LoggerPort;
};

export async function softDeleteClient(
  input: SoftDeleteClientInput,
  deps: SoftDeleteClientDeps,
): Promise<Result<Client>> {
  deps.logger.debug('softDeleteClient', { clientId: input.clientId });

  // Authorization: only admin or owner can delete clients
  if (!hasMinimumRole(input.callerRole, 'admin')) {
    return err(insufficientRole('admin', input.callerRole));
  }

  // Verify the client exists and is not already deleted
  const existingResult = await deps.clientRepository.findById(input.clientId, input.organizationId);
  if (!isOk(existingResult)) {
    return err(clientNotFound(input.clientId));
  }
  if (existingResult.value.deletedAt !== null) {
    return err(clientDeleted(input.clientId));
  }

  const result = await deps.clientRepository.softDelete(
    input.clientId,
    input.organizationId,
    input.deletedBy,
  );

  if (!isOk(result)) {
    deps.logger.error('softDeleteClient: repository error', { error: result });
    return result;
  }

  deps.logger.info('softDeleteClient: deleted', { clientId: input.clientId });
  return ok(result.value);
}
