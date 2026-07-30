/**
 * Tests — Organization row mappers
 */
import { describe, it, expect } from 'vitest';
import {
  rowToOrganization,
  rowToOrganizationMember,
  rowToOrganizationInvitation,
} from '../organization.mapper';

const baseOrgRow = {
  id: 'org-uuid-1',
  name: 'Bop Agency',
  slug: 'bop-agency',
  plan: 'free',
  settings: { color: 'red' },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
};

describe('rowToOrganization()', () => {
  it('maps all fields correctly', () => {
    const entity = rowToOrganization(baseOrgRow);
    expect(entity.id).toBe('org-uuid-1');
    expect(entity.name).toBe('Bop Agency');
    expect(entity.slug).toBe('bop-agency');
    expect(entity.plan).toBe('free');
    expect(entity.settings).toEqual({ color: 'red' });
    expect(entity.createdAt).toBeInstanceOf(Date);
    expect(entity.updatedAt).toBeInstanceOf(Date);
  });

  it('parses ISO date strings into Date objects', () => {
    const entity = rowToOrganization(baseOrgRow);
    expect(entity.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});

const baseMemberRow = {
  id: 'member-uuid-1',
  organization_id: 'org-uuid-1',
  user_id: 'user-uuid-1',
  role: 'owner',
  status: 'active',
  invited_by: null,
  joined_at: '2026-01-01T00:00:00Z',
};

describe('rowToOrganizationMember()', () => {
  it('maps all fields', () => {
    const entity = rowToOrganizationMember(baseMemberRow);
    expect(entity.id).toBe('member-uuid-1');
    expect(entity.organizationId).toBe('org-uuid-1');
    expect(entity.userId).toBe('user-uuid-1');
    expect(entity.role).toBe('owner');
    expect(entity.status).toBe('active');
    expect(entity.invitedBy).toBeNull();
    expect(entity.joinedAt).toBeInstanceOf(Date);
  });

  it('maps invited_by when present', () => {
    const entity = rowToOrganizationMember({ ...baseMemberRow, invited_by: 'admin-uuid' });
    expect(entity.invitedBy).toBe('admin-uuid');
  });

  it('maps status = suspended', () => {
    const entity = rowToOrganizationMember({ ...baseMemberRow, status: 'suspended' });
    expect(entity.status).toBe('suspended');
  });

  it('maps status = invited', () => {
    const entity = rowToOrganizationMember({ ...baseMemberRow, status: 'invited' });
    expect(entity.status).toBe('invited');
  });

  it('maps status = removed', () => {
    const entity = rowToOrganizationMember({ ...baseMemberRow, status: 'removed' });
    expect(entity.status).toBe('removed');
  });
});

const baseInvitationRow = {
  id: 'inv-uuid-1',
  organization_id: 'org-uuid-1',
  email: 'invitee@example.com',
  role: 'operator',
  invited_by: 'admin-uuid',
  token: 'tok-abc123',
  status: 'pending',
  expires_at: '2026-08-01T00:00:00Z',
  accepted_at: null,
  created_at: '2026-07-01T00:00:00Z',
};

describe('rowToOrganizationInvitation()', () => {
  it('maps all fields', () => {
    const entity = rowToOrganizationInvitation(baseInvitationRow);
    expect(entity.id).toBe('inv-uuid-1');
    expect(entity.email).toBe('invitee@example.com');
    expect(entity.role).toBe('operator');
    expect(entity.token).toBe('tok-abc123');
    expect(entity.status).toBe('pending');
    expect(entity.acceptedAt).toBeNull();
    expect(entity.expiresAt).toBeInstanceOf(Date);
  });

  it('maps accepted_at when present', () => {
    const entity = rowToOrganizationInvitation({
      ...baseInvitationRow,
      accepted_at: '2026-07-15T00:00:00Z',
      status: 'accepted',
    });
    expect(entity.acceptedAt).toBeInstanceOf(Date);
    expect(entity.status).toBe('accepted');
  });
});
