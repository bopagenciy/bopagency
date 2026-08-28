import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalendarAgendaView } from '../CalendarAgendaView';
import type {
  ContentCalendarItemProjection,
  ContentCalendarItemId,
  OrganizationId,
  CampaignId,
} from '@bop-agency/domain';

describe('CalendarAgendaView Component', () => {
  const mockItems: ContentCalendarItemProjection[] = [
    {
      id: 'cal-1' as ContentCalendarItemId,
      organizationId: 'org-1' as OrganizationId,
      campaignId: 'camp-1' as CampaignId,
      campaignName: 'Campaña Aniversario',
      clientId: 'cli-1',
      clientName: 'Cliente Beta',
      activationId: null,
      targetId: null,
      channel: 'google_ads',
      provider: 'google',
      title: 'Anuncio Google Search',
      contentSummary: null,
      scheduledFor: new Date('2026-09-20T14:00:00Z'),
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

  it('renders empty message when no items, or grouped list when items exist', () => {
    const handleSelect = vi.fn();
    const { rerender } = render(<CalendarAgendaView items={[]} onSelectItem={handleSelect} />);

    expect(screen.getByText('No hay elementos de calendario programados en este rango.')).toBeInTheDocument();

    rerender(<CalendarAgendaView items={mockItems} onSelectItem={handleSelect} />);
    expect(screen.getByText('Anuncio Google Search')).toBeInTheDocument();
    expect(screen.getByText('Campaña Aniversario')).toBeInTheDocument();
  });
});
