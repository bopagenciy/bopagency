import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CalendarItemCard } from '../CalendarItemCard';
import type {
  ContentCalendarItemProjection,
  ContentCalendarItemId,
  OrganizationId,
  CampaignId,
} from '@bop-agency/domain';

describe('CalendarItemCard Component', () => {
  const item: ContentCalendarItemProjection = {
    id: 'cal-1' as ContentCalendarItemId,
    organizationId: 'org-1' as OrganizationId,
    campaignId: 'camp-1' as CampaignId,
    campaignName: 'Campaña Cyberlunes',
    clientId: 'cli-1',
    clientName: 'Cliente Gamma',
    activationId: null,
    targetId: null,
    channel: 'meta_ads',
    provider: 'meta',
    title: 'Anuncio Carrusel Meta',
    contentSummary: null,
    scheduledFor: new Date('2026-09-25T15:00:00Z'),
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
  };

  it('renders title, provider, derived label, and triggers onSelect when clicked', () => {
    const handleSelect = vi.fn();
    render(<CalendarItemCard item={item} onSelect={handleSelect} />);

    expect(screen.getByText('Anuncio Carrusel Meta')).toBeInTheDocument();
    expect(screen.getByText('meta')).toBeInTheDocument();
    expect(screen.getByText('Planificado')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(handleSelect).toHaveBeenCalledWith(item);
  });
});
