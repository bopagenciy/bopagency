/**
 * Supabase implementation of OrganizationRepository.
 *
 * SEGURIDAD:
 * - Usa el cliente del usuario (con RLS activo) para operaciones normales
 * - Nunca usa service_role_key en esta capa — la autorización está en RLS + use cases
 */
import { ok, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  Organization,
  OrganizationId,
  OrganizationMember,
  OrganizationInvitation,
  OrganizationRole,
} from '@bop-agency/domain';
import {
  organizationNotFound,
  memberNotFound,
  invitationNotFound,
  invitationExpired,
  invitationAlreadyAccepted,
} from '@bop-agency/domain';
import type { OrganizationRepository } from '@bop-agency/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  rowToOrganization,
  rowToOrganizationMember,
  rowToOrganizationInvitation,
} from './mappers/organization.mapper';

export class SupabaseOrganizationRepository implements OrganizationRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findById(id: OrganizationId): Promise<Result<Organization>> {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return err(organizationNotFound(id));
    return ok(rowToOrganization(data));
  }

  async findBySlug(slug: string): Promise<Result<Organization>> {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !data) return err(organizationNotFound(slug));
    return ok(rowToOrganization(data));
  }

  async findByUserId(userId: string): Promise<Result<Organization[]>> {
    const { data, error } = await this.supabase
      .from('organization_members')
      .select('organizations(*)')
      .eq('user_id', userId);

    if (error) return err(organizationNotFound(userId));

    const orgs = (data ?? [])
      .map((row: { organizations: unknown }) => row.organizations)
      .filter(Boolean)
      .map((org: unknown) => rowToOrganization(org as Parameters<typeof rowToOrganization>[0]));

    return ok(orgs);
  }

  async create(
    input: { name: string; slug: string; plan?: Organization['plan'] },
    ownerId: string,
  ): Promise<Result<Organization>> {
    // 1. Create the organization
    const { data: org, error: orgError } = await this.supabase
      .from('organizations')
      .insert({
        name: input.name,
        slug: input.slug,
        plan: input.plan ?? 'free',
        settings: {},
      })
      .select()
      .single();

    if (orgError || !org) {
      return err(organizationNotFound('create-failed'));
    }

    // 2. Add the creator as owner
    const { error: memberError } = await this.supabase.from('organization_members').insert({
      organization_id: org.id,
      user_id: ownerId,
      role: 'owner',
    });

    if (memberError) {
      return err(organizationNotFound('member-create-failed'));
    }

    // 3. Set as active organization for the user
    await this.supabase
      .from('profiles')
      .update({ active_organization_id: org.id })
      .eq('id', ownerId);

    return ok(rowToOrganization(org));
  }

  async update(
    id: OrganizationId,
    input: { name?: string; settings?: Record<string, unknown> },
  ): Promise<Result<Organization>> {
    const { data, error } = await this.supabase
      .from('organizations')
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) return err(organizationNotFound(id));
    return ok(rowToOrganization(data));
  }

  // --- Members ---

  async findMembers(orgId: OrganizationId): Promise<Result<OrganizationMember[]>> {
    const { data, error } = await this.supabase
      .from('organization_members')
      .select('*')
      .eq('organization_id', orgId);

    if (error) return err(organizationNotFound(orgId));
    return ok((data ?? []).map(rowToOrganizationMember));
  }

  async findMember(orgId: OrganizationId, userId: string): Promise<Result<OrganizationMember>> {
    const { data, error } = await this.supabase
      .from('organization_members')
      .select('*')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .single();

    if (error || !data) return err(memberNotFound(orgId, userId));
    return ok(rowToOrganizationMember(data));
  }

  async addMember(
    orgId: OrganizationId,
    userId: string,
    role: OrganizationRole,
    invitedBy?: string,
  ): Promise<Result<OrganizationMember>> {
    const { data, error } = await this.supabase
      .from('organization_members')
      .insert({ organization_id: orgId, user_id: userId, role, invited_by: invitedBy ?? null })
      .select()
      .single();

    if (error || !data) return err(memberNotFound(orgId, userId));
    return ok(rowToOrganizationMember(data));
  }

  async updateMemberRole(
    orgId: OrganizationId,
    userId: string,
    role: OrganizationRole,
  ): Promise<Result<OrganizationMember>> {
    const { data, error } = await this.supabase
      .from('organization_members')
      .update({ role })
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) return err(memberNotFound(orgId, userId));
    return ok(rowToOrganizationMember(data));
  }

  async removeMember(orgId: OrganizationId, userId: string): Promise<Result<void>> {
    const { error } = await this.supabase
      .from('organization_members')
      .delete()
      .eq('organization_id', orgId)
      .eq('user_id', userId);

    if (error) return err(memberNotFound(orgId, userId));
    return ok(undefined);
  }

  // --- Invitations ---

  async findInvitations(orgId: OrganizationId): Promise<Result<OrganizationInvitation[]>> {
    const { data, error } = await this.supabase
      .from('organization_invitations')
      .select('*')
      .eq('organization_id', orgId)
      .eq('status', 'pending');

    if (error) return err(organizationNotFound(orgId));
    return ok((data ?? []).map(rowToOrganizationInvitation));
  }

  async findInvitationByToken(token: string): Promise<Result<OrganizationInvitation>> {
    const { data, error } = await this.supabase
      .from('organization_invitations')
      .select('*')
      .eq('token', token)
      .single();

    if (error || !data) return err(invitationNotFound(token));
    return ok(rowToOrganizationInvitation(data));
  }

  async createInvitation(
    orgId: OrganizationId,
    email: string,
    role: OrganizationRole,
    invitedBy: string,
  ): Promise<Result<OrganizationInvitation>> {
    const { data, error } = await this.supabase
      .from('organization_invitations')
      .insert({ organization_id: orgId, email, role, invited_by: invitedBy })
      .select()
      .single();

    if (error || !data) return err(invitationNotFound('create-failed'));
    return ok(rowToOrganizationInvitation(data));
  }

  async acceptInvitation(token: string, userId: string): Promise<Result<OrganizationMember>> {
    const invResult = await this.findInvitationByToken(token);
    if (!invResult.success) return invResult;

    const inv = invResult.value;

    if (inv.status === 'accepted') return err(invitationAlreadyAccepted());
    if (inv.status !== 'pending' || inv.expiresAt < new Date()) {
      return err(invitationExpired());
    }

    // Mark invitation as accepted
    await this.supabase
      .from('organization_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('token', token);

    // Add member
    return this.addMember(inv.organizationId, userId, inv.role, inv.invitedBy);
  }

  async cancelInvitation(invitationId: string): Promise<Result<void>> {
    const { error } = await this.supabase
      .from('organization_invitations')
      .update({ status: 'cancelled' })
      .eq('id', invitationId);

    if (error) return err(invitationNotFound(invitationId));
    return ok(undefined);
  }
}
