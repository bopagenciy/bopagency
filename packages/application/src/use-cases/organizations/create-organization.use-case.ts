import { ok, err, isErr } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { Organization, OrganizationMember } from '@bop-agency/domain';
import { organizationSlugTaken } from '@bop-agency/domain';
import type { OrganizationRepository } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type CreateOrganizationInput = {
  readonly name: string;
  readonly slug: string;
  readonly ownerId: string;
};

export type CreateOrganizationDeps = {
  readonly organizationRepository: OrganizationRepository;
  readonly logger: LoggerPort;
};

export type CreateOrganizationOutput = {
  readonly organization: Organization;
  readonly membership: OrganizationMember;
};

export async function createOrganization(
  input: CreateOrganizationInput,
  deps: CreateOrganizationDeps,
): Promise<Result<CreateOrganizationOutput>> {
  deps.logger.debug('createOrganization', { name: input.name, slug: input.slug });

  // Check if slug is available
  const existingResult = await deps.organizationRepository.findBySlug(input.slug);
  if (!isErr(existingResult)) {
    return err(organizationSlugTaken(input.slug));
  }

  const result = await deps.organizationRepository.create(
    { name: input.name, slug: input.slug },
    input.ownerId,
  );

  if (isErr(result)) return result;

  // Get the owner membership that was created
  const memberResult = await deps.organizationRepository.findMember(result.value.id, input.ownerId);

  if (isErr(memberResult)) return memberResult;

  return ok({
    organization: result.value,
    membership: memberResult.value,
  });
}
