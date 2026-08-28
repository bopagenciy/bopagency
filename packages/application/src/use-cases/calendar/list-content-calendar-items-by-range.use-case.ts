import { err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  ContentCalendarItemProjection,
  ListContentCalendarItemsByRangeFilter,
  ContentCalendarRepository,
} from '@bop-agency/domain';

export type ListContentCalendarItemsByRangeDeps = {
  readonly calendarRepository: ContentCalendarRepository;
};

export async function listContentCalendarItemsByRange(
  filter: ListContentCalendarItemsByRangeFilter,
  deps: ListContentCalendarItemsByRangeDeps,
): Promise<Result<ContentCalendarItemProjection[]>> {
  if (!filter.startAt || !filter.endAt) {
    return err({
      code: 'VALIDATION_ERROR',
      message: 'Las fechas startAt y endAt son requeridas para la consulta de calendario',
    });
  }

  if (filter.startAt > filter.endAt) {
    return err({
      code: 'VALIDATION_ERROR',
      message: 'La fecha de inicio startAt no puede ser posterior a endAt',
    });
  }

  return deps.calendarRepository.listByRange(filter);
}
