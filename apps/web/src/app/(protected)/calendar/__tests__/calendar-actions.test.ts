import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createContentCalendarItemAction,
  updateContentCalendarItemScheduleAction,
  cancelContentCalendarItemAction,
  listContentCalendarItemsAction,
} from '../calendar-actions';
import * as authContext from '@/lib/auth/server';
import { createCalendarComposition } from '@/lib/composition/calendar.composition';
import { ok } from '@bop-agency/shared';
import type { ContentCalendarItem, ContentCalendarItemProjection } from '@bop-agency/domain';

vi.mock('@/lib/auth/server', () => ({
  requireOrganization: vi.fn(),
  requireOrganizationRole: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock('@/lib/composition/calendar.composition', () => ({
  createCalendarComposition: vi.fn(),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('Content Calendar Server Actions Security & Boundary Tests', () => {
  const mockComposition = {
    createItem: vi.fn(),
    updateSchedule: vi.fn(),
    cancelItem: vi.fn(),
    linkTarget: vi.fn(),
    listByRange: vi.fn(),
    getItemDetail: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createCalendarComposition).mockReturnValue(mockComposition as unknown as ReturnType<typeof createCalendarComposition>);
  });

  it('createContentCalendarItemAction requires operator role and delegates to composition', async () => {
    vi.mocked(authContext.requireOrganizationRole).mockResolvedValue({
      organization: { id: 'org-1' },
      membership: { role: 'operator' },
      user: {} as unknown,
    } as unknown as Awaited<ReturnType<typeof authContext.requireOrganizationRole>>);
    mockComposition.createItem.mockResolvedValue(ok({ id: 'cal-1' } as unknown as ContentCalendarItem));

    const result = await createContentCalendarItemAction({
      campaignId: 'camp-1',
      channel: 'meta_ads',
      provider: 'meta',
      title: 'Nuevo Post',
      scheduledForISO: '2026-09-01T12:00:00Z',
    });

    expect(result.success).toBe(true);
    expect(authContext.requireOrganizationRole).toHaveBeenCalledWith('operator');
    expect(mockComposition.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        campaignId: 'camp-1',
        title: 'Nuevo Post',
      }),
    );
  });

  it('updateContentCalendarItemScheduleAction fails if unauthenticated or role denied', async () => {
    vi.mocked(authContext.requireOrganizationRole).mockRejectedValue(new Error('No autorizado'));

    const result = await updateContentCalendarItemScheduleAction({
      calendarItemId: 'cal-1',
      scheduledForISO: '2026-09-05T12:00:00Z',
      rescheduleReason: 'Cambio de fecha',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('No autorizado');
    }
    expect(mockComposition.updateSchedule).not.toHaveBeenCalled();
  });

  it('cancelContentCalendarItemAction requires strategist role floor', async () => {
    vi.mocked(authContext.requireOrganizationRole).mockResolvedValue({
      organization: { id: 'org-1' },
      membership: { role: 'strategist' },
      user: {} as unknown,
    } as unknown as Awaited<ReturnType<typeof authContext.requireOrganizationRole>>);
    mockComposition.cancelItem.mockResolvedValue(ok({ id: 'cal-1', status: 'cancelled' } as unknown as ContentCalendarItem));

    const result = await cancelContentCalendarItemAction({
      calendarItemId: 'cal-1',
      reason: 'Cancelación por presupuesto',
    });

    expect(result.success).toBe(true);
    expect(authContext.requireOrganizationRole).toHaveBeenCalledWith('strategist');
  });

  it('listContentCalendarItemsAction resolves org from session and filters range', async () => {
    vi.mocked(authContext.requireOrganization).mockResolvedValue({
      organization: { id: 'org-1' },
      membership: { role: 'viewer' },
      user: {} as unknown,
    } as unknown as Awaited<ReturnType<typeof authContext.requireOrganization>>);
    mockComposition.listByRange.mockResolvedValue(ok([{ id: 'cal-1', title: 'Post 1' } as unknown as ContentCalendarItemProjection]));

    const result = await listContentCalendarItemsAction({
      startAtISO: '2026-09-01T00:00:00Z',
      endAtISO: '2026-09-30T23:59:59Z',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(1);
    }
    expect(authContext.requireOrganization).toHaveBeenCalledOnce();
  });
});
