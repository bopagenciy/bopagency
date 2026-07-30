/**
 * Tests — UserProfile row mappers
 */
import { describe, it, expect } from 'vitest';
import { rowToUserProfile, rowToUserPreferences } from '../user-profile.mapper';

const baseProfileRow = {
  id: 'user-uuid-1',
  email: 'user@example.com',
  full_name: 'John Doe',
  avatar_url: 'https://example.com/avatar.png',
  active_organization_id: 'org-uuid-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
};

describe('rowToUserProfile()', () => {
  it('maps all fields', () => {
    const entity = rowToUserProfile(baseProfileRow);
    expect(entity.id).toBe('user-uuid-1');
    expect(entity.email).toBe('user@example.com');
    expect(entity.fullName).toBe('John Doe');
    expect(entity.avatarUrl).toBe('https://example.com/avatar.png');
    expect(entity.activeOrganizationId).toBe('org-uuid-1');
    expect(entity.createdAt).toBeInstanceOf(Date);
    expect(entity.updatedAt).toBeInstanceOf(Date);
  });

  it('maps null optional fields', () => {
    const entity = rowToUserProfile({
      ...baseProfileRow,
      full_name: null,
      avatar_url: null,
      active_organization_id: null,
    });
    expect(entity.fullName).toBeNull();
    expect(entity.avatarUrl).toBeNull();
    expect(entity.activeOrganizationId).toBeNull();
  });
});

const basePrefsRow = {
  id: 'prefs-uuid-1',
  user_id: 'user-uuid-1',
  active_organization_id: 'org-uuid-1',
  language: 'es',
  timezone: 'America/Bogota',
  email_notifications: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
};

describe('rowToUserPreferences()', () => {
  it('maps all fields including activeOrganizationId', () => {
    const entity = rowToUserPreferences(basePrefsRow);
    expect(entity.id).toBe('prefs-uuid-1');
    expect(entity.userId).toBe('user-uuid-1');
    expect(entity.activeOrganizationId).toBe('org-uuid-1');
    expect(entity.language).toBe('es');
    expect(entity.timezone).toBe('America/Bogota');
    expect(entity.emailNotifications).toBe(true);
    expect(entity.createdAt).toBeInstanceOf(Date);
    expect(entity.updatedAt).toBeInstanceOf(Date);
  });

  it('maps activeOrganizationId as null when not set', () => {
    const entity = rowToUserPreferences({ ...basePrefsRow, active_organization_id: null });
    expect(entity.activeOrganizationId).toBeNull();
  });

  it('maps email_notifications false', () => {
    const entity = rowToUserPreferences({ ...basePrefsRow, email_notifications: false });
    expect(entity.emailNotifications).toBe(false);
  });
});
