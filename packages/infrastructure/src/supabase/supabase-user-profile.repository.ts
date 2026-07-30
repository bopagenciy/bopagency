import { ok, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { UserProfile, UserPreferences } from '@bop-agency/domain';
import { profileNotFound } from '@bop-agency/domain';
import type {
  UserProfileRepository,
  UpdateProfileInput,
  UpdatePreferencesInput,
} from '@bop-agency/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rowToUserProfile, rowToUserPreferences } from './mappers/user-profile.mapper';

export class SupabaseUserProfileRepository implements UserProfileRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findById(userId: string): Promise<Result<UserProfile>> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) return err(profileNotFound(userId));
    return ok(rowToUserProfile(data));
  }

  async update(userId: string, input: UpdateProfileInput): Promise<Result<UserProfile>> {
    const updatePayload: Record<string, unknown> = {};
    if (input.fullName !== undefined) updatePayload['full_name'] = input.fullName;
    if (input.avatarUrl !== undefined) updatePayload['avatar_url'] = input.avatarUrl;
    if (input.activeOrganizationId !== undefined)
      updatePayload['active_organization_id'] = input.activeOrganizationId;

    const { data, error } = await this.supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', userId)
      .select()
      .single();

    if (error || !data) return err(profileNotFound(userId));
    return ok(rowToUserProfile(data));
  }

  async setActiveOrganization(
    userId: string,
    organizationId: string | null,
  ): Promise<Result<UserProfile>> {
    // user_preferences es la fuente de verdad para la organización activa
    await this.supabase
      .from('user_preferences')
      .update({ active_organization_id: organizationId })
      .eq('user_id', userId);

    // Mantener profiles sincronizado para compatibilidad hacia atrás
    return this.update(userId, { activeOrganizationId: organizationId });
  }

  async findPreferences(userId: string): Promise<Result<UserPreferences>> {
    const { data, error } = await this.supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) return err(profileNotFound(userId));
    return ok(rowToUserPreferences(data));
  }

  async updatePreferences(
    userId: string,
    input: UpdatePreferencesInput,
  ): Promise<Result<UserPreferences>> {
    const updatePayload: Record<string, unknown> = {};
    if (input.language !== undefined) updatePayload['language'] = input.language;
    if (input.timezone !== undefined) updatePayload['timezone'] = input.timezone;
    if (input.emailNotifications !== undefined)
      updatePayload['email_notifications'] = input.emailNotifications;

    const { data, error } = await this.supabase
      .from('user_preferences')
      .update(updatePayload)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) return err(profileNotFound(userId));
    return ok(rowToUserPreferences(data));
  }
}
