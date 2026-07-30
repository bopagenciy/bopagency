import type { Result } from '@bop-agency/shared';
import type { Organization } from '@bop-agency/domain';
import type { OrganizationRepository } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type ListOrganizationsInput = {
  readonly userId: string;
};

export type ListOrganizationsDeps = {
  readonly organizationRepository: OrganizationRepository;
  readonly logger: LoggerPort;
};

export async function listOrganizations(
  input: ListOrganizationsInput,
  deps: ListOrganizationsDeps,
): Promise<Result<Organization[]>> {
  deps.logger.debug('listOrganizations', { userId: input.userId });
  return deps.organizationRepository.findByUserId(input.userId);
}
