import type { UserProfile, UserPreferences } from '@bop-agency/domain';
import { userProfileId } from '@bop-agency/domain';

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  active_organization_id: string | null;
  created_at: string;
  updated_at: string;
};

type PreferencesRow = {
  id: string;
  user_id: string;
  active_organization_id: string | null;
  language: string;
  timezone: string;
  email_notifications: boolean;
  created_at: string;
  updated_at: string;
};

export function rowToUserProfile(row: ProfileRow): UserProfile {
  return {
    id: userProfileId(row.id),
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    activeOrganizationId: row.active_organization_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function rowToUserPreferences(row: PreferencesRow): UserPreferences {
  return {
    id: row.id,
    userId: row.user_id,
    activeOrganizationId: row.active_organization_id,
    language: row.language,
    timezone: row.timezone,
    emailNotifications: row.email_notifications,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
