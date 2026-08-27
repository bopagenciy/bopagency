import { describe, it, expect, vi } from 'vitest';
import { ok } from '@bop-agency/shared';
import { createContentCalendarItem } from '../create-content-calendar-item.use-case';
import { updateContentCalendarItemSchedule } from '../update-content-calendar-item-schedule.use-case';
import { cancelContentCalendarItem } from '../cancel-content-calendar-item.use-case';
import { listContentCalendarItemsByRange } from '../list-content-calendar-items-by-range.use-case';
import type {
  ContentCalendarRepository,
  OrganizationId,
  CampaignId,
  ContentCalendarItemId,
} from '@bop-agency/domain';

describe('Content Calendar Application Use Cases', () => {
  const makeMockRepo = (): ContentCalendarRepository => ({
    create: vi.fn(),
    reschedule: vi.fn(),
    cancel: vi.fn(),
    linkTarget: vi.fn(),
    findById: vi.fn(),
    listByRange: vi.fn(),
  });

  describe('createContentCalendarItem', () => {
    it('validates title and IANA timezone before invoking repo', async () => {
      const repo = makeMockRepo();

      const invalidTitleResult = await createContentCalendarItem(
        {
          organizationId: 'org-1' as OrganizationId,
          campaignId: 'camp-1' as CampaignId,
          channel: 'meta_ads',
          provider: 'meta',
          title: '',
          scheduledFor: new Date('2026-09-01T12:00:00Z'),
        },
        { calendarRepository: repo },
      );
      expect(invalidTitleResult.success).toBe(false);
      if (!invalidTitleResult.success) {
        expect(invalidTitleResult.error.code).toBe('VALIDATION_ERROR');
      }

      const invalidTzResult = await createContentCalendarItem(
        {
          organizationId: 'org-1' as OrganizationId,
          campaignId: 'camp-1' as CampaignId,
          channel: 'meta_ads',
          provider: 'meta',
          title: 'Valid Title',
          scheduledFor: new Date('2026-09-01T12:00:00Z'),
          timezone: 'Invalid/Tz',
        },
        { calendarRepository: repo },
      );
      expect(invalidTzResult.success).toBe(false);
      if (!invalidTzResult.success) {
        expect(invalidTzResult.error.code).toBe('VALIDATION_ERROR');
      }

      vi.mocked(repo.create).mockResolvedValue(
        ok({
          id: 'cal-1' as ContentCalendarItemId,
          organizationId: 'org-1' as OrganizationId,
          campaignId: 'camp-1' as CampaignId,
          activationId: null,
          targetId: null,
          channel: 'meta_ads',
          provider: 'meta',
          title: 'Valid Title',
          contentSummary: null,
          scheduledFor: new Date('2026-09-01T12:00:00Z'),
          timezone: 'America/Bogota',
          status: 'planned',
          rescheduleReason: null,
          notes: null,
          createdBy: 'user-1',
          updatedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const validResult = await createContentCalendarItem(
        {
          organizationId: 'org-1' as OrganizationId,
          campaignId: 'camp-1' as CampaignId,
          channel: 'meta_ads',
          provider: 'meta',
          title: 'Valid Title',
          scheduledFor: new Date('2026-09-01T12:00:00Z'),
          timezone: 'America/Bogota',
        },
        { calendarRepository: repo },
      );

      expect(validResult.success).toBe(true);
      expect(repo.create).toHaveBeenCalledOnce();
    });
  });

  describe('updateContentCalendarItemSchedule', () => {
    it('requires non-empty rescheduleReason', async () => {
      const repo = makeMockRepo();

      const noReasonResult = await updateContentCalendarItemSchedule(
        {
          calendarItemId: 'cal-1' as ContentCalendarItemId,
          organizationId: 'org-1' as OrganizationId,
          scheduledFor: new Date('2026-09-05T12:00:00Z'),
          rescheduleReason: '',
        },
        { calendarRepository: repo },
      );

      expect(noReasonResult.success).toBe(false);
      if (!noReasonResult.success) {
        expect(noReasonResult.error.code).toBe('VALIDATION_ERROR');
      }
      expect(repo.reschedule).not.toHaveBeenCalled();
    });
  });

  describe('cancelContentCalendarItem', () => {
    it('requires non-empty reason', async () => {
      const repo = makeMockRepo();

      const result = await cancelContentCalendarItem(
        {
          calendarItemId: 'cal-1' as ContentCalendarItemId,
          organizationId: 'org-1' as OrganizationId,
          reason: '   ',
        },
        { calendarRepository: repo },
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
      expect(repo.cancel).not.toHaveBeenCalled();
    });
  });

  describe('listContentCalendarItemsByRange', () => {
    it('validates startAt <= endAt', async () => {
      const repo = makeMockRepo();

      const result = await listContentCalendarItemsByRange(
        {
          organizationId: 'org-1' as OrganizationId,
          startAt: new Date('2026-09-30T00:00:00Z'),
          endAt: new Date('2026-09-01T00:00:00Z'),
        },
        { calendarRepository: repo },
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
      expect(repo.listByRange).not.toHaveBeenCalled();
    });
  });
});
