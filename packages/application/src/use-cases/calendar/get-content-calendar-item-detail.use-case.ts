import { err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  ContentCalendarItem,
  ContentCalendarItemId,
  OrganizationId,
  ContentCalendarRepository,
} from '@bop-agency/domain';

export type GetContentCalendarItemDetailDeps = {
  readonly calendarRepository: ContentCalendarRepository;
};

export async function getContentCalendarItemDetail(
  id: ContentCalendarItemId,
  organizationId: OrganizationId,
  deps: GetContentCalendarItemDetailDeps,
): Promise<Result<ContentCalendarItem | null>> {
  if (!id) {
    return err({
      code: 'VALIDATION_ERROR',
      message: 'Se requiere id de elemento de calendario',
    });
  }

  return deps.calendarRepository.findById(id, organizationId);
}
