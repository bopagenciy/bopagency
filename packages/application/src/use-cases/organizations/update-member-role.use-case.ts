import { err, isErr } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { OrganizationMember, OrganizationId, OrganizationRole } from '@bop-agency/domain';
import { notOrganizationMember, insufficientRole, hasMinimumRole } from '@bop-agency/domain';
import type { OrganizationRepository } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type UpdateMemberRoleInput = {
  readonly organizationId: OrganizationId;
  readonly targetUserId: string;
  readonly newRole: OrganizationRole;
  readonly requestedBy: string;
};

export type UpdateMemberRoleDeps = {
  readonly organizationRepository: OrganizationRepository;
  readonly logger: LoggerPort;
};

export async function updateMemberRole(
  input: UpdateMemberRoleInput,
  deps: UpdateMemberRoleDeps,
): Promise<Result<OrganizationMember>> {
  deps.logger.debug('updateMemberRole', {
    orgId: input.organizationId,
    target: input.targetUserId,
    newRole: input.newRole,
  });

  // Verify requester is a member with admin or owner role
  const requesterResult = await deps.organizationRepository.findMember(
    input.organizationId,
    input.requestedBy,
  );
  if (isErr(requesterResult)) {
    return err(notOrganizationMember());
  }

  if (!hasMinimumRole(requesterResult.value.role, 'admin')) {
    return err(insufficientRole('admin', requesterResult.value.role));
  }

  return deps.organizationRepository.updateMemberRole(
    input.organizationId,
    input.targetUserId,
    input.newRole,
  );
}
