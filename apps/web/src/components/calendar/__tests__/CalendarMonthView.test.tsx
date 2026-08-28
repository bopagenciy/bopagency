import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalendarMonthView } from '../CalendarMonthView';
import type {
  ContentCalendarItemProjection,
  ContentCalendarItemId,
  OrganizationId,
  CampaignId,
} from '@bop-agency/domain';

describe('CalendarMonthView Component', () => {
  const currentDate = new Date('2026-09-15T12:00:00Z');
  const mockItems: ContentCalendarItemProjection[] = [
    {
      id: 'cal-1' as ContentCalendarItemId,
      organizationId: 'org-1' as OrganizationId,
      campaignId: 'camp-1' as CampaignId,
      campaignName: 'Campaña Primavera',
      clientId: 'cli-1',
      clientName: 'Cliente Alpha',
      activationId: null,
      targetId: null,
      channel: 'meta_ads',
      provider: 'meta',
      title: 'Post Instagram',
      contentSummary: null,
      scheduledFor: new Date('2026-09-15T10:00:00Z'),
      timezone: 'America/Bogota',
      calendarStatus: 'planned',
      rescheduleReason: null,
      notes: null,
      campaignStatus: 'approved',
      targetStatus: null,
      publicationJobStatus: null,
      createdBy: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it('renders days of week header and items in correct date cell', () => {
    const handleSelect = vi.fn();
    render(
      <CalendarMonthView
        currentDate={currentDate}
        items={mockItems}
        onSelectItem={handleSelect}
      />,
    );

    expect(screen.getByText('Lun')).toBeInTheDocument();
    expect(screen.getByText('Dom')).toBeInTheDocument();
    expect(screen.getByText('Post Instagram')).toBeInTheDocument();
  });
});
