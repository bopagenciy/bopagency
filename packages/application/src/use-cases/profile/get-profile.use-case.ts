import type { Result } from '@bop-agency/shared';
import type { UserProfile } from '@bop-agency/domain';
import type { UserProfileRepository } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type GetProfileInput = {
  readonly userId: string;
};

export type GetProfileDeps = {
  readonly userProfileRepository: UserProfileRepository;
  readonly logger: LoggerPort;
};

export async function getProfile(
  input: GetProfileInput,
  deps: GetProfileDeps,
): Promise<Result<UserProfile>> {
  deps.logger.debug('getProfile', { userId: input.userId });
  return deps.userProfileRepository.findById(input.userId);
}
