import type { Result } from '@bop-agency/shared';
import type { OrganizationId } from '../entities/organization';
import type {
  ContentCalendarItem,
  ContentCalendarItemId,
  ContentCalendarItemProjection,
  CreateContentCalendarItemInput,
  UpdateContentCalendarItemScheduleInput,
  CancelContentCalendarItemInput,
  LinkContentCalendarItemTargetInput,
  ListContentCalendarItemsByRangeFilter,
} from '../entities/content-calendar-item';

export interface ContentCalendarRepository {
  create(input: CreateContentCalendarItemInput): Promise<Result<ContentCalendarItem>>;

  reschedule(input: UpdateContentCalendarItemScheduleInput): Promise<Result<ContentCalendarItem>>;

  cancel(input: CancelContentCalendarItemInput): Promise<Result<ContentCalendarItem>>;

  linkTarget(input: LinkContentCalendarItemTargetInput): Promise<Result<ContentCalendarItem>>;

  findById(
    id: ContentCalendarItemId,
    organizationId: OrganizationId,
  ): Promise<Result<ContentCalendarItem | null>>;

  listByRange(
    filter: ListContentCalendarItemsByRangeFilter,
  ): Promise<Result<ContentCalendarItemProjection[]>>;
}
