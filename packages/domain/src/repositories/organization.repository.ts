import type { Result } from '@bop-agency/shared';
import type {
  Organization,
  OrganizationId,
  OrganizationMember,
  OrganizationInvitation,
  OrganizationRole,
} from '../entities/organization';

export type CreateOrganizationInput = {
  readonly name: string;
  readonly slug: string;
  readonly plan?: Organization['plan'];
};

export type UpdateOrganizationInput = {
  readonly name?: string;
  readonly settings?: Record<string, unknown>;
};

export interface OrganizationRepository {
  findById(id: OrganizationId): Promise<Result<Organization>>;
  findBySlug(slug: string): Promise<Result<Organization>>;
  findByUserId(userId: string): Promise<Result<Organization[]>>;
  create(input: CreateOrganizationInput, ownerId: string): Promise<Result<Organization>>;
  update(id: OrganizationId, input: UpdateOrganizationInput): Promise<Result<Organization>>;

  // Members
  findMembers(orgId: OrganizationId): Promise<Result<OrganizationMember[]>>;
  findMember(orgId: OrganizationId, userId: string): Promise<Result<OrganizationMember>>;
  addMember(
    orgId: OrganizationId,
    userId: string,
    role: OrganizationRole,
    invitedBy?: string,
  ): Promise<Result<OrganizationMember>>;
  updateMemberRole(
    orgId: OrganizationId,
    userId: string,
    role: OrganizationRole,
  ): Promise<Result<OrganizationMember>>;
  removeMember(orgId: OrganizationId, userId: string): Promise<Result<void>>;

  // Invitations
  findInvitations(orgId: OrganizationId): Promise<Result<OrganizationInvitation[]>>;
  findInvitationByToken(token: string): Promise<Result<OrganizationInvitation>>;
  createInvitation(
    orgId: OrganizationId,
    email: string,
    role: OrganizationRole,
    invitedBy: string,
  ): Promise<Result<OrganizationInvitation>>;
  acceptInvitation(token: string, userId: string): Promise<Result<OrganizationMember>>;
  cancelInvitation(invitationId: string): Promise<Result<void>>;
}
