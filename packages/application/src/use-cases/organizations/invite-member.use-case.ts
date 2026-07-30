import { err, isErr } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { OrganizationInvitation, OrganizationId, OrganizationRole } from '@bop-agency/domain';
import { notOrganizationMember, insufficientRole, hasMinimumRole } from '@bop-agency/domain';
import type { OrganizationRepository } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type InviteMemberInput = {
  readonly organizationId: OrganizationId;
  readonly email: string;
  readonly role: Exclude<OrganizationRole, 'owner'>;
  readonly invitedBy: string;
};

export type InviteMemberDeps = {
  readonly organizationRepository: OrganizationRepository;
  readonly logger: LoggerPort;
};

export async function inviteMember(
  input: InviteMemberInput,
  deps: InviteMemberDeps,
): Promise<Result<OrganizationInvitation>> {
  deps.logger.debug('inviteMember', {
    orgId: input.organizationId,
    email: input.email,
    role: input.role,
  });

  // Verify inviter is a member
  const inviterResult = await deps.organizationRepository.findMember(
    input.organizationId,
    input.invitedBy,
  );
  if (isErr(inviterResult)) {
    return err(notOrganizationMember());
  }

  // Verify inviter has admin or owner role
  if (!hasMinimumRole(inviterResult.value.role, 'admin')) {
    return err(insufficientRole('admin', inviterResult.value.role));
  }

  return deps.organizationRepository.createInvitation(
    input.organizationId,
    input.email,
    input.role,
    input.invitedBy,
  );
}
