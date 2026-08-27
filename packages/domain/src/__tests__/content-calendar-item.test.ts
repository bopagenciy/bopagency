import { describe, it, expect } from 'vitest';
import {
  contentCalendarItemId,
  computeCalendarDerivedState,
  isValidIanaTimezone,
  type ContentCalendarItemProjection,
} from '../entities/content-calendar-item';
import type { OrganizationId } from '../entities/organization';
import type { CampaignId } from '../entities/campaign';

describe('ContentCalendarItem Domain Entity & Pure Helpers', () => {
  it('contentCalendarItemId creates branded id or throws on empty', () => {
    const id = contentCalendarItemId('cal-123');
    expect(id).toBe('cal-123');
    expect(() => contentCalendarItemId('')).toThrow('ContentCalendarItemId cannot be empty');
    expect(() => contentCalendarItemId('   ')).toThrow('ContentCalendarItemId cannot be empty');
  });

  it('isValidIanaTimezone validates valid IANA timezones and rejects invalid', () => {
    expect(isValidIanaTimezone('America/Bogota')).toBe(true);
    expect(isValidIanaTimezone('UTC')).toBe(true);
    expect(isValidIanaTimezone('Europe/Madrid')).toBe(true);
    expect(isValidIanaTimezone('America/New_York')).toBe(true);
    expect(isValidIanaTimezone('Invalid/Timezone_Name')).toBe(false);
    expect(isValidIanaTimezone('')).toBe(false);
  });

  describe('computeCalendarDerivedState precedence', () => {
    const now = new Date('2026-08-28T12:00:00Z');
    const past = new Date('2026-08-20T12:00:00Z');
    const future = new Date('2026-09-01T12:00:00Z');

    const baseProjection: ContentCalendarItemProjection = {
      id: contentCalendarItemId('cal-1'),
      organizationId: 'org-1' as OrganizationId,
      campaignId: 'camp-1' as CampaignId,
      campaignName: 'Black Friday Campaign',
      clientId: 'cli-1',
      clientName: 'Client Alpha',
      activationId: null,
      targetId: null,
      channel: 'meta_ads',
      provider: 'meta',
      title: 'Post de Promoción',
      contentSummary: 'Resumen del post',
      scheduledFor: future,
      timezone: 'America/Bogota',
      calendarStatus: 'planned',
      rescheduleReason: null,
      notes: null,
      campaignStatus: 'approved',
      targetStatus: null,
      publicationJobStatus: null,
      createdBy: 'user-1',
      createdAt: now,
      updatedAt: now,
    };

    it('cancelled item returns Cancelado and not overdue/blocked', () => {
      const proj: ContentCalendarItemProjection = {
        ...baseProjection,
        calendarStatus: 'cancelled',
        scheduledFor: past,
      };
      const result = computeCalendarDerivedState(proj, now);
      expect(result.derivedLabel).toBe('Cancelado');
      expect(result.isOverdue).toBe(false);
      expect(result.isBlocked).toBe(false);
      expect(result.blockedReason).toBe(null);
    });

    it('published job returns Publicado label', () => {
      const proj: ContentCalendarItemProjection = {
        ...baseProjection,
        calendarStatus: 'scheduled',
        targetStatus: 'published',
        publicationJobStatus: 'succeeded',
      };
      const result = computeCalendarDerivedState(proj, now);
      expect(result.derivedLabel).toBe('Publicado');
      expect(result.isOverdue).toBe(false);
    });

    it('in_progress publication job returns En publicación', () => {
      const proj: ContentCalendarItemProjection = {
        ...baseProjection,
        calendarStatus: 'scheduled',
        targetStatus: 'publishing',
        publicationJobStatus: 'in_progress',
      };
      const result = computeCalendarDerivedState(proj, now);
      expect(result.derivedLabel).toBe('En publicación');
    });

    it('unknown_outcome returns Resultado indeterminado and isBlocked UNKNOWN_OUTCOME', () => {
      const proj: ContentCalendarItemProjection = {
        ...baseProjection,
        calendarStatus: 'scheduled',
        targetStatus: 'publishing',
        publicationJobStatus: 'unknown_outcome',
      };
      const result = computeCalendarDerivedState(proj, now);
      expect(result.derivedLabel).toBe('Resultado indeterminado');
      expect(result.isBlocked).toBe(true);
      expect(result.blockedReason).toBe('UNKNOWN_OUTCOME');
    });

    it('failed job returns Fallido label and isBlocked JOB_FAILED', () => {
      const proj: ContentCalendarItemProjection = {
        ...baseProjection,
        calendarStatus: 'scheduled',
        targetStatus: null,
        publicationJobStatus: 'failed',
      };
      const result = computeCalendarDerivedState(proj, now);
      expect(result.derivedLabel).toBe('Fallido');
      expect(result.isBlocked).toBe(true);
      expect(result.blockedReason).toBe('JOB_FAILED');
    });

    it('unapproved campaign returns isBlocked CAMPAIGN_NOT_APPROVED', () => {
      const proj: ContentCalendarItemProjection = {
        ...baseProjection,
        campaignStatus: 'draft',
      };
      const result = computeCalendarDerivedState(proj, now);
      expect(result.isBlocked).toBe(true);
      expect(result.blockedReason).toBe('CAMPAIGN_NOT_APPROVED');
      expect(result.derivedLabel).toBe('Bloqueado');
    });

    it('past-due planned item with missing activation returns Vencido and isBlocked ACTIVATION_MISSING', () => {
      const proj: ContentCalendarItemProjection = {
        ...baseProjection,
        scheduledFor: past,
        activationId: null,
      };
      const result = computeCalendarDerivedState(proj, now);
      expect(result.isOverdue).toBe(true);
      expect(result.isBlocked).toBe(true);
      expect(result.blockedReason).toBe('ACTIVATION_MISSING');
      expect(result.derivedLabel).toBe('Vencido');
    });

    it('future planned item is not blocked or overdue', () => {
      const result = computeCalendarDerivedState(baseProjection, now);
      expect(result.isOverdue).toBe(false);
      expect(result.isBlocked).toBe(false);
      expect(result.blockedReason).toBe(null);
      expect(result.derivedLabel).toBe('Planificado');
    });

    it('future scheduled item displays Programado', () => {
      const proj: ContentCalendarItemProjection = {
        ...baseProjection,
        activationId: 'act-1' as CampaignActivationId,
        targetId: 'tgt-1' as CampaignActivationTargetId,
        calendarStatus: 'scheduled',
      };
      const result = computeCalendarDerivedState(proj, now);
      expect(result.derivedLabel).toBe('Programado');
    });
  });
});
