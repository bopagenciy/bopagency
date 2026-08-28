'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireOrganization, requireOrganizationRole } from '@/lib/auth/server';
import { createCalendarComposition } from '@/lib/composition/calendar.composition';
import type {
  ContentCalendarItemId,
  CampaignId,
  OrganizationId,
  CampaignActivationTargetId,
  ActivationChannel,
  ActivationProvider,
  ContentCalendarItemProjection,
} from '@bop-agency/domain';

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export async function createContentCalendarItemAction(input: {
  campaignId: string;
  channel: ActivationChannel;
  provider: ActivationProvider;
  title: string;
  contentSummary?: string | null | undefined;
  scheduledForISO: string;
  timezone?: string | undefined;
  notes?: string | null | undefined;
}): Promise<ActionResult> {
  try {
    const { organization } = await requireOrganizationRole('operator');
    const client = await createServerSupabaseClient();
    const composition = createCalendarComposition(client);

    const scheduledFor = new Date(input.scheduledForISO);

    const result = await composition.createItem({
      organizationId: organization.id as OrganizationId,
      campaignId: input.campaignId as CampaignId,
      channel: input.channel,
      provider: input.provider,
      title: input.title,
      contentSummary: input.contentSummary,
      scheduledFor,
      timezone: input.timezone,
      notes: input.notes,
    });

    if (!result.success) {
      return { success: false, error: result.error.message, code: result.error.code };
    }

    revalidatePath('/calendar');
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error de autorización u operación';
    return { success: false, error: msg };
  }
}

export async function updateContentCalendarItemScheduleAction(input: {
  calendarItemId: string;
  scheduledForISO: string;
  timezone?: string | undefined;
  rescheduleReason: string;
}): Promise<ActionResult> {
  try {
    const { organization } = await requireOrganizationRole('operator');
    const client = await createServerSupabaseClient();
    const composition = createCalendarComposition(client);

    const scheduledFor = new Date(input.scheduledForISO);

    const result = await composition.updateSchedule({
      calendarItemId: input.calendarItemId as ContentCalendarItemId,
      organizationId: organization.id as OrganizationId,
      scheduledFor,
      timezone: input.timezone,
      rescheduleReason: input.rescheduleReason,
    });

    if (!result.success) {
      return { success: false, error: result.error.message, code: result.error.code };
    }

    revalidatePath('/calendar');
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error de autorización u operación';
    return { success: false, error: msg };
  }
}

export async function cancelContentCalendarItemAction(input: {
  calendarItemId: string;
  reason: string;
}): Promise<ActionResult> {
  try {
    const { organization } = await requireOrganizationRole('strategist');
    const client = await createServerSupabaseClient();
    const composition = createCalendarComposition(client);

    const result = await composition.cancelItem({
      calendarItemId: input.calendarItemId as ContentCalendarItemId,
      organizationId: organization.id as OrganizationId,
      reason: input.reason,
    });

    if (!result.success) {
      return { success: false, error: result.error.message, code: result.error.code };
    }

    revalidatePath('/calendar');
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error de autorización u operación';
    return { success: false, error: msg };
  }
}

export async function linkContentCalendarItemTargetAction(input: {
  calendarItemId: string;
  targetId: string;
}): Promise<ActionResult> {
  try {
    const { organization } = await requireOrganizationRole('operator');
    const client = await createServerSupabaseClient();
    const composition = createCalendarComposition(client);

    const result = await composition.linkTarget({
      calendarItemId: input.calendarItemId as ContentCalendarItemId,
      organizationId: organization.id as OrganizationId,
      targetId: input.targetId as CampaignActivationTargetId,
    });

    if (!result.success) {
      return { success: false, error: result.error.message, code: result.error.code };
    }

    revalidatePath('/calendar');
    return { success: true, data: undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error de autorización u operación';
    return { success: false, error: msg };
  }
}

export async function listContentCalendarItemsAction(input: {
  startAtISO: string;
  endAtISO: string;
  campaignId?: string | undefined;
  channel?: ActivationChannel | undefined;
}): Promise<ActionResult<ContentCalendarItemProjection[]>> {
  try {
    const { organization } = await requireOrganization();
    const client = await createServerSupabaseClient();
    const composition = createCalendarComposition(client);

    const result = await composition.listByRange({
      organizationId: organization.id as OrganizationId,
      startAt: new Date(input.startAtISO),
      endAt: new Date(input.endAtISO),
      campaignId: input.campaignId ? (input.campaignId as CampaignId) : undefined,
      channel: input.channel,
    });

    if (!result.success) {
      return { success: false, error: result.error.message, code: result.error.code };
    }

    return { success: true, data: result.value };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al obtener elementos de calendario';
    return { success: false, error: msg };
  }
}
