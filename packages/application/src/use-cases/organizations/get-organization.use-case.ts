import { isErr } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { Organization, OrganizationId } from '@bop-agency/domain';
import type { OrganizationRepository } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type GetOrganizationInput = {
  readonly organizationId: OrganizationId;
};

export type GetOrganizationDeps = {
  readonly organizationRepository: OrganizationRepository;
  readonly logger: LoggerPort;
};

export async function getOrganization(
  input: GetOrganizationInput,
  deps: GetOrganizationDeps,
): Promise<Result<Organization>> {
  deps.logger.debug('getOrganization', { id: input.organizationId });

  const result = await deps.organizationRepository.findById(input.organizationId);
  if (isErr(result)) {
    deps.logger.warn('getOrganization: not found', { id: input.organizationId });
  }
  return result;
}
