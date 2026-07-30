import { err, isErr } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { OrganizationMember, OrganizationId } from '@bop-agency/domain';
import { notOrganizationMember } from '@bop-agency/domain';
import type { OrganizationRepository } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type GetMembershipInput = {
  readonly organizationId: OrganizationId;
  readonly userId: string;
};

export type GetMembershipDeps = {
  readonly organizationRepository: OrganizationRepository;
  readonly logger: LoggerPort;
};

export async function getMembership(
  input: GetMembershipInput,
  deps: GetMembershipDeps,
): Promise<Result<OrganizationMember>> {
  deps.logger.debug('getMembership', { orgId: input.organizationId, userId: input.userId });

  const result = await deps.organizationRepository.findMember(input.organizationId, input.userId);

  if (isErr(result)) {
    return err(notOrganizationMember());
  }

  return result;
}
