import type { Result } from '@bop-agency/shared';
import type { UserProfile, UserPreferences } from '../entities/user-profile';

export type UpdateProfileInput = {
  readonly fullName?: string;
  readonly avatarUrl?: string;
  readonly activeOrganizationId?: string | null;
};

export type UpdatePreferencesInput = {
  readonly language?: string;
  readonly timezone?: string;
  readonly emailNotifications?: boolean;
};

export interface UserProfileRepository {
  findById(userId: string): Promise<Result<UserProfile>>;
  update(userId: string, input: UpdateProfileInput): Promise<Result<UserProfile>>;
  setActiveOrganization(
    userId: string,
    organizationId: string | null,
  ): Promise<Result<UserProfile>>;

  // Preferences
  findPreferences(userId: string): Promise<Result<UserPreferences>>;
  updatePreferences(
    userId: string,
    input: UpdatePreferencesInput,
  ): Promise<Result<UserPreferences>>;
}
