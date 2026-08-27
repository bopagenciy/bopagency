import { err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import {
  isValidIanaTimezone,
  type ContentCalendarItem,
  type CreateContentCalendarItemInput,
  type ContentCalendarRepository,
} from '@bop-agency/domain';

export type CreateContentCalendarItemDeps = {
  readonly calendarRepository: ContentCalendarRepository;
};

export async function createContentCalendarItem(
  input: CreateContentCalendarItemInput,
  deps: CreateContentCalendarItemDeps,
): Promise<Result<ContentCalendarItem>> {
  if (!input.title || input.title.trim().length === 0) {
    return err({
      code: 'VALIDATION_ERROR',
      message: 'El título del elemento de calendario es requerido',
    });
  }

  if (input.title.trim().length > 300) {
    return err({
      code: 'VALIDATION_ERROR',
      message: 'El título no puede exceder los 300 caracteres',
    });
  }

  if (input.timezone && !isValidIanaTimezone(input.timezone)) {
    return err({
      code: 'VALIDATION_ERROR',
      message: `Zona horaria IANA no válida: ${input.timezone}`,
    });
  }

  if (!input.scheduledFor || isNaN(input.scheduledFor.getTime())) {
    return err({
      code: 'VALIDATION_ERROR',
      message: 'La fecha scheduledFor debe ser una fecha válida',
    });
  }

  return deps.calendarRepository.create(input);
}
