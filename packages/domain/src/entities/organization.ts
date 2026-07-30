/**
 * Organization domain entities.
 *
 * Roles hierarchy (ascending privilege):
 * viewer < operator < strategist < admin < owner
 */

export type OrganizationId = string & { readonly _brand: 'OrganizationId' };

export type OrganizationRole = 'owner' | 'admin' | 'strategist' | 'operator' | 'viewer';

export type MembershipStatus = 'active' | 'invited' | 'suspended' | 'removed';

export type OrganizationPlan = 'free' | 'pro' | 'enterprise';

export type Organization = {
  readonly id: OrganizationId;
  readonly name: string;
  readonly slug: string;
  readonly plan: OrganizationPlan;
  readonly settings: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type OrganizationMember = {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly userId: string;
  readonly role: OrganizationRole;
  readonly status: MembershipStatus;
  readonly invitedBy: string | null;
  readonly joinedAt: Date;
};

export type OrganizationInvitation = {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly email: string;
  readonly role: OrganizationRole;
  readonly invitedBy: string;
  readonly token: string;
  readonly status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly createdAt: Date;
};

// Factory helper
export function organizationId(id: string): OrganizationId {
  return id as OrganizationId;
}

// Role hierarchy helpers
const ROLE_HIERARCHY: OrganizationRole[] = ['viewer', 'operator', 'strategist', 'admin', 'owner'];

export function hasMinimumRole(
  userRole: OrganizationRole,
  requiredRole: OrganizationRole,
): boolean {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(requiredRole);
}

export function canManageOrganization(role: OrganizationRole): boolean {
  return hasMinimumRole(role, 'admin');
}
