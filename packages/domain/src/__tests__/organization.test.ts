/**
 * Tests — Organization domain helpers
 */
import { describe, it, expect } from 'vitest';
import {
  hasMinimumRole,
  canManageOrganization,
  organizationId,
  type OrganizationRole,
} from '../entities/organization';

describe('organizationId()', () => {
  it('wraps a string as OrganizationId', () => {
    const id = organizationId('abc-123');
    expect(id).toBe('abc-123');
  });
});

describe('hasMinimumRole()', () => {
  const cases: Array<[OrganizationRole, OrganizationRole, boolean]> = [
    ['owner', 'viewer', true],
    ['owner', 'owner', true],
    ['admin', 'owner', false],
    ['admin', 'admin', true],
    ['admin', 'strategist', true],
    ['strategist', 'admin', false],
    ['operator', 'strategist', false],
    ['viewer', 'viewer', true],
    ['viewer', 'operator', false],
  ];

  it.each(cases)('hasMinimumRole(%s, %s) → %s', (userRole, requiredRole, expected) => {
    expect(hasMinimumRole(userRole, requiredRole)).toBe(expected);
  });
});

describe('canManageOrganization()', () => {
  it('returns true for owner', () => expect(canManageOrganization('owner')).toBe(true));
  it('returns true for admin', () => expect(canManageOrganization('admin')).toBe(true));
  it('returns false for strategist', () => expect(canManageOrganization('strategist')).toBe(false));
  it('returns false for operator', () => expect(canManageOrganization('operator')).toBe(false));
  it('returns false for viewer', () => expect(canManageOrganization('viewer')).toBe(false));
});
