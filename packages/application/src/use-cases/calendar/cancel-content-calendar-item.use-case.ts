import { err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  ContentCalendarItem,
  CancelContentCalendarItemInput,
  ContentCalendarRepository,
} from '@bop-agency/domain';

export type CancelContentCalendarItemDeps = {
  readonly calendarRepository: ContentCalendarRepository;
};

export async function cancelContentCalendarItem(
  input: CancelContentCalendarItemInput,
  deps: CancelContentCalendarItemDeps,
): Promise<Result<ContentCalendarItem>> {
  if (!input.reason || input.reason.trim().length === 0) {
    return err({
      code: 'VALIDATION_ERROR',
      message: 'Se requiere un motivo no vacío para la cancelación',
    });
  }

  return deps.calendarRepository.cancel(input);
}
