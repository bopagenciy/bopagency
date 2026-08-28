import { describe, it, expect, vi } from 'vitest';
import { SupabaseContentCalendarRepository } from '../supabase/repositories/supabase-content-calendar.repository';
import type { OrganizationId, CampaignId, ContentCalendarItemId } from '@bop-agency/domain';

import type { SupabaseClient } from '@supabase/supabase-js';

describe('SupabaseContentCalendarRepository Unit Tests (Mocked Client)', () => {
  const mockRpc = vi.fn();
  const mockClient = {
    rpc: mockRpc,
    from: vi.fn(),
  } as unknown as SupabaseClient;

  const repo = new SupabaseContentCalendarRepository(mockClient);

  it('create invokes create_content_calendar_item RPC with correct parameters', async () => {
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 'cal-1',
          organization_id: 'org-1',
          campaign_id: 'camp-1',
          channel: 'social_media',
          provider: 'meta_ads',
          title: 'Post Test',
          content_summary: 'Summary',
          scheduled_for: '2026-09-01T12:00:00Z',
          timezone: 'America/Bogota',
          status: 'planned',
          notes: 'Notes',
          created_by: 'user-1',
          created_at: '2026-08-28T00:00:00Z',
          updated_at: '2026-08-28T00:00:00Z',
        },
      },
      error: null,
    });

    const result = await repo.create({
      organizationId: 'org-1' as OrganizationId,
      campaignId: 'camp-1' as CampaignId,
      channel: 'meta_ads',
      provider: 'meta',
      title: 'Post Test',
      contentSummary: 'Summary',
      scheduledFor: new Date('2026-09-01T12:00:00Z'),
      timezone: 'America/Bogota',
      notes: 'Notes',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.id).toBe('cal-1');
    expect(result.value.status).toBe('planned');
    expect(mockClient.rpc).toHaveBeenCalledWith('create_content_calendar_item', expect.objectContaining({
      p_organization_id: 'org-1',
      p_campaign_id: 'camp-1',
      p_title: 'Post Test',
    }));
  });

  it('reschedule handles RPC errors cleanly', async () => {
    mockRpc.mockResolvedValue({
      data: {
        success: false,
        error_code: 'STATE_CONFLICT',
        message: 'Programación bloqueada por job en ejecución',
      },
      error: null,
    });

    const result = await repo.reschedule({
      calendarItemId: 'cal-1' as ContentCalendarItemId,
      organizationId: 'org-1' as OrganizationId,
      scheduledFor: new Date('2026-09-05T12:00:00Z'),
      rescheduleReason: 'Petición del cliente',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('STATE_CONFLICT');
    expect(result.error.message).toContain('bloqueada');
  });

  it('listByRange maps SQL rows to projections correctly', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'cal-1',
          organization_id: 'org-1',
          campaign_id: 'camp-1',
          campaign_name: 'Campaña Primavera',
          client_id: 'cli-1',
          client_name: 'Cliente Demo',
          activation_id: null,
          target_id: null,
          channel: 'social_media',
          provider: 'meta_ads',
          title: 'Post 1',
          content_summary: null,
          scheduled_for: '2026-09-01T12:00:00Z',
          timezone: 'America/Bogota',
          calendar_status: 'planned',
          reschedule_reason: null,
          notes: null,
          campaign_status: 'approved',
          target_status: null,
          publication_job_status: null,
          created_by: 'user-1',
          created_at: '2026-08-28T00:00:00Z',
          updated_at: '2026-08-28T00:00:00Z',
        },
      ],
      error: null,
    });

    const result = await repo.listByRange({
      organizationId: 'org-1' as OrganizationId,
      startAt: new Date('2026-09-01T00:00:00Z'),
      endAt: new Date('2026-09-30T23:59:59Z'),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.length).toBe(1);
    expect(result.value[0]?.campaignName).toBe('Campaña Primavera');
  });
});
