import { err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import {
  isValidIanaTimezone,
  type ContentCalendarItem,
  type UpdateContentCalendarItemScheduleInput,
  type ContentCalendarRepository,
} from '@bop-agency/domain';

export type UpdateContentCalendarItemScheduleDeps = {
  readonly calendarRepository: ContentCalendarRepository;
};

export async function updateContentCalendarItemSchedule(
  input: UpdateContentCalendarItemScheduleInput,
  deps: UpdateContentCalendarItemScheduleDeps,
): Promise<Result<ContentCalendarItem>> {
  if (!input.rescheduleReason || input.rescheduleReason.trim().length === 0) {
    return err({
      code: 'VALIDATION_ERROR',
      message: 'Se requiere un motivo no vacío para la reprogramación',
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

  return deps.calendarRepository.reschedule(input);
}
