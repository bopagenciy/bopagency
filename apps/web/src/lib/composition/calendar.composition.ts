import { SupabaseContentCalendarRepository } from '@bop-agency/infrastructure';
import {
  createContentCalendarItem,
  updateContentCalendarItemSchedule,
  cancelContentCalendarItem,
  linkContentCalendarItemTarget,
  listContentCalendarItemsByRange,
  getContentCalendarItemDetail,
} from '@bop-agency/application';
import type {
  CreateContentCalendarItemInput,
  UpdateContentCalendarItemScheduleInput,
  CancelContentCalendarItemInput,
  LinkContentCalendarItemTargetInput,
  ListContentCalendarItemsByRangeFilter,
  ContentCalendarItemId,
  OrganizationId,
} from '@bop-agency/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createCalendarComposition(client: SupabaseClient) {
  const calendarRepository = new SupabaseContentCalendarRepository(client);

  return {
    createItem: (input: CreateContentCalendarItemInput) =>
      createContentCalendarItem(input, { calendarRepository }),

    updateSchedule: (input: UpdateContentCalendarItemScheduleInput) =>
      updateContentCalendarItemSchedule(input, { calendarRepository }),

    cancelItem: (input: CancelContentCalendarItemInput) =>
      cancelContentCalendarItem(input, { calendarRepository }),

    linkTarget: (input: LinkContentCalendarItemTargetInput) =>
      linkContentCalendarItemTarget(input, { calendarRepository }),

    listByRange: (filter: ListContentCalendarItemsByRangeFilter) =>
      listContentCalendarItemsByRange(filter, { calendarRepository }),

    getItemDetail: (id: ContentCalendarItemId, organizationId: OrganizationId) =>
      getContentCalendarItemDetail(id, organizationId, { calendarRepository }),
  };
}
