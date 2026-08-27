import { err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  ContentCalendarItem,
  LinkContentCalendarItemTargetInput,
  ContentCalendarRepository,
} from '@bop-agency/domain';

export type LinkContentCalendarItemTargetDeps = {
  readonly calendarRepository: ContentCalendarRepository;
};

export async function linkContentCalendarItemTarget(
  input: LinkContentCalendarItemTargetInput,
  deps: LinkContentCalendarItemTargetDeps,
): Promise<Result<ContentCalendarItem>> {
  if (!input.calendarItemId) {
    return err({
      code: 'VALIDATION_ERROR',
      message: 'Se requiere id de elemento de calendario',
    });
  }

  if (!input.targetId) {
    return err({
      code: 'VALIDATION_ERROR',
      message: 'Se requiere id de target de activación',
    });
  }

  return deps.calendarRepository.linkTarget(input);
}
