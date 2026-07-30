/**
 * UserProfile domain entity.
 * Represents the public profile of an authenticated user (extends auth.users).
 */

export type UserProfileId = string & { readonly _brand: 'UserProfileId' };

export type UserProfile = {
  readonly id: UserProfileId;
  readonly email: string;
  readonly fullName: string | null;
  readonly avatarUrl: string | null;
  readonly activeOrganizationId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type UserPreferences = {
  readonly id: string;
  readonly userId: string;
  readonly activeOrganizationId: string | null;
  readonly language: string;
  readonly timezone: string;
  readonly emailNotifications: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export function userProfileId(id: string): UserProfileId {
  return id as UserProfileId;
}
