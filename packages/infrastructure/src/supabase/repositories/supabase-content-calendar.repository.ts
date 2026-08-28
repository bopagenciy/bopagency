import { ok, err } from '@bop-agency/shared';
import type { Result, AppError } from '@bop-agency/shared';
import {
  contentCalendarItemId,
  type ContentCalendarItem,
  type ContentCalendarItemProjection,
  type ContentCalendarRepository,
  type CreateContentCalendarItemInput,
  type UpdateContentCalendarItemScheduleInput,
  type CancelContentCalendarItemInput,
  type LinkContentCalendarItemTargetInput,
  type ListContentCalendarItemsByRangeFilter,
  type OrganizationId,
  type CampaignId,
  type CampaignActivationId,
  type CampaignActivationTargetId,
  type ActivationChannel,
  type ActivationProvider,
  type CalendarItemStatus,
} from '@bop-agency/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseContentCalendarRepository implements ContentCalendarRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(input: CreateContentCalendarItemInput): Promise<Result<ContentCalendarItem>> {
    const { data, error } = await this.client.rpc('create_content_calendar_item', {
      p_organization_id: input.organizationId,
      p_campaign_id: input.campaignId,
      p_channel: input.channel,
      p_provider: input.provider,
      p_title: input.title,
      p_content_summary: input.contentSummary ?? null,
      p_scheduled_for: input.scheduledFor.toISOString(),
      p_timezone: input.timezone ?? 'UTC',
      p_notes: input.notes ?? null,
    });

    if (error) {
      return err({
        code: 'INTERNAL_ERROR',
        message: `Error invoking create_content_calendar_item: ${error.message}`,
      });
    }

    const res = data as { success: boolean; data?: Record<string, unknown>; error_code?: string; message?: string };

    if (!res.success || !res.data) {
      return err({
        code: (res.error_code as AppError['code']) || 'INTERNAL_ERROR',
        message: res.message || 'Error al crear elemento de calendario',
      });
    }

    return ok(this.mapDbToEntity(res.data));
  }

  async reschedule(input: UpdateContentCalendarItemScheduleInput): Promise<Result<ContentCalendarItem>> {
    const { data, error } = await this.client.rpc('reschedule_content_calendar_item', {
      p_calendar_item_id: input.calendarItemId,
      p_organization_id: input.organizationId,
      p_scheduled_for: input.scheduledFor.toISOString(),
      p_timezone: input.timezone ?? 'UTC',
      p_reschedule_reason: input.rescheduleReason,
    });

    if (error) {
      return err({
        code: 'INTERNAL_ERROR',
        message: `Error invoking reschedule_content_calendar_item: ${error.message}`,
      });
    }

    const res = data as { success: boolean; data?: Record<string, unknown>; error_code?: string; message?: string };

    if (!res.success || !res.data) {
      return err({
        code: (res.error_code as AppError['code']) || 'INTERNAL_ERROR',
        message: res.message || 'Error al reprogramar elemento de calendario',
      });
    }

    return ok(this.mapDbToEntity(res.data));
  }

  async cancel(input: CancelContentCalendarItemInput): Promise<Result<ContentCalendarItem>> {
    const { data, error } = await this.client.rpc('cancel_content_calendar_item', {
      p_calendar_item_id: input.calendarItemId,
      p_organization_id: input.organizationId,
      p_reason: input.reason,
    });

    if (error) {
      return err({
        code: 'INTERNAL_ERROR',
        message: `Error invoking cancel_content_calendar_item: ${error.message}`,
      });
    }

    const res = data as { success: boolean; data?: Record<string, unknown>; error_code?: string; message?: string };

    if (!res.success || !res.data) {
      return err({
        code: (res.error_code as AppError['code']) || 'INTERNAL_ERROR',
        message: res.message || 'Error al cancelar elemento de calendario',
      });
    }

    return ok(this.mapDbToEntity(res.data));
  }

  async linkTarget(input: LinkContentCalendarItemTargetInput): Promise<Result<ContentCalendarItem>> {
    const { data, error } = await this.client.rpc('link_content_calendar_item_target', {
      p_calendar_item_id: input.calendarItemId,
      p_organization_id: input.organizationId,
      p_target_id: input.targetId,
    });

    if (error) {
      return err({
        code: 'INTERNAL_ERROR',
        message: `Error invoking link_content_calendar_item_target: ${error.message}`,
      });
    }

    const res = data as { success: boolean; data?: Record<string, unknown>; error_code?: string; message?: string };

    if (!res.success || !res.data) {
      return err({
        code: (res.error_code as AppError['code']) || 'INTERNAL_ERROR',
        message: res.message || 'Error al vincular target de activación',
      });
    }

    return ok(this.mapDbToEntity(res.data));
  }

  async findById(
    id: string,
    organizationId: OrganizationId,
  ): Promise<Result<ContentCalendarItem | null>> {
    const { data, error } = await this.client
      .from('content_calendar_items')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) {
      return err({
        code: 'INTERNAL_ERROR',
        message: `Error retrieving calendar item ${id}: ${error.message}`,
      });
    }

    if (!data) {
      return ok(null);
    }

    return ok(this.mapDbToEntity(data as Record<string, unknown>));
  }

  async listByRange(
    filter: ListContentCalendarItemsByRangeFilter,
  ): Promise<Result<ContentCalendarItemProjection[]>> {
    const { data, error } = await this.client.rpc('list_content_calendar_items_by_range', {
      p_organization_id: filter.organizationId,
      p_start_at: filter.startAt.toISOString(),
      p_end_at: filter.endAt.toISOString(),
      p_campaign_id: filter.campaignId ?? null,
      p_channel: filter.channel ?? null,
    });

    if (error) {
      return err({
        code: 'INTERNAL_ERROR',
        message: `Error listing content calendar items: ${error.message}`,
      });
    }

    const rows = (data || []) as Record<string, unknown>[];
    const projections = rows.map((row) => this.mapDbToProjection(row));

    return ok(projections);
  }

  private mapDbToEntity(row: Record<string, unknown>): ContentCalendarItem {
    return {
      id: contentCalendarItemId(row.id as string),
      organizationId: row.organization_id as OrganizationId,
      campaignId: row.campaign_id as CampaignId,
      activationId: row.activation_id ? (row.activation_id as CampaignActivationId) : null,
      targetId: row.target_id ? (row.target_id as CampaignActivationTargetId) : null,
      channel: row.channel as ActivationChannel,
      provider: row.provider as ActivationProvider,
      title: row.title as string,
      contentSummary: row.content_summary ? (row.content_summary as string) : null,
      scheduledFor: new Date(row.scheduled_for as string),
      timezone: row.timezone as string,
      status: row.status as CalendarItemStatus,
      rescheduleReason: row.reschedule_reason ? (row.reschedule_reason as string) : null,
      notes: row.notes ? (row.notes as string) : null,
      createdBy: row.created_by as string,
      updatedBy: row.updated_by ? (row.updated_by as string) : null,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapDbToProjection(row: Record<string, unknown>): ContentCalendarItemProjection {
    return {
      id: contentCalendarItemId(row.id as string),
      organizationId: row.organization_id as OrganizationId,
      campaignId: row.campaign_id as CampaignId,
      campaignName: (row.campaign_name as string) || 'Campaña sin nombre',
      clientId: row.client_id as string,
      clientName: (row.client_name as string) || 'Cliente sin nombre',
      activationId: row.activation_id ? (row.activation_id as CampaignActivationId) : null,
      targetId: row.target_id ? (row.target_id as CampaignActivationTargetId) : null,
      channel: row.channel as ActivationChannel,
      provider: row.provider as ActivationProvider,
      title: row.title as string,
      contentSummary: row.content_summary ? (row.content_summary as string) : null,
      scheduledFor: new Date(row.scheduled_for as string),
      timezone: row.timezone as string,
      calendarStatus: row.calendar_status as CalendarItemStatus,
      rescheduleReason: row.reschedule_reason ? (row.reschedule_reason as string) : null,
      notes: row.notes ? (row.notes as string) : null,
      campaignStatus: (row.campaign_status as string) || 'draft',
      targetStatus: row.target_status ? (row.target_status as string) : null,
      publicationJobStatus: row.publication_job_status ? (row.publication_job_status as string) : null,
      createdBy: row.created_by as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
