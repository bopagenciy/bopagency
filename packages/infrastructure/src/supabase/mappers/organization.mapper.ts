/**
 * Mappers: Supabase DB rows → Domain entities
 *
 * Estos mappers no tienen dependencias externas — son funciones puras.
 */
import type {
  Organization,
  OrganizationMember,
  OrganizationInvitation,
  OrganizationId,
  OrganizationRole,
  MembershipStatus,
} from '@bop-agency/domain';
import { organizationId } from '@bop-agency/domain';

// --- Row types (debe coincidir con supabase/migrations/...) ---

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type MemberRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  status: string;
  invited_by: string | null;
  joined_at: string;
};

type InvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  invited_by: string;
  token: string;
  status: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

// --- Mappers ---

export function rowToOrganization(row: OrgRow): Organization {
  return {
    id: organizationId(row.id),
    name: row.name,
    slug: row.slug,
    plan: row.plan as Organization['plan'],
    settings: row.settings,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function rowToOrganizationMember(row: MemberRow): OrganizationMember {
  return {
    id: row.id,
    organizationId: organizationId(row.organization_id),
    userId: row.user_id,
    role: row.role as OrganizationRole,
    status: row.status as MembershipStatus,
    invitedBy: row.invited_by,
    joinedAt: new Date(row.joined_at),
  };
}

export function rowToOrganizationInvitation(row: InvitationRow): OrganizationInvitation {
  return {
    id: row.id,
    organizationId: organizationId(row.organization_id) as OrganizationId,
    email: row.email,
    role: row.role as OrganizationRole,
    invitedBy: row.invited_by,
    token: row.token,
    status: row.status as OrganizationInvitation['status'],
    expiresAt: new Date(row.expires_at),
    acceptedAt: row.accepted_at ? new Date(row.accepted_at) : null,
    createdAt: new Date(row.created_at),
  };
}
