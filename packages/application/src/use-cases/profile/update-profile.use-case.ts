import type { Result } from '@bop-agency/shared';
import type { UserProfile } from '@bop-agency/domain';
import type { UserProfileRepository, UpdateProfileInput } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type UpdateProfileInput_ = UpdateProfileInput & {
  readonly userId: string;
};

export type UpdateProfileDeps = {
  readonly userProfileRepository: UserProfileRepository;
  readonly logger: LoggerPort;
};

export async function updateProfile(
  input: UpdateProfileInput_,
  deps: UpdateProfileDeps,
): Promise<Result<UserProfile>> {
  deps.logger.debug('updateProfile', { userId: input.userId });

  const { userId, ...updateData } = input;
  return deps.userProfileRepository.update(userId, updateData);
}
