import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RescheduleCalendarItemModal } from '../RescheduleCalendarItemModal';
import type {
  ContentCalendarItemProjection,
  ContentCalendarItemId,
  OrganizationId,
  CampaignId,
} from '@bop-agency/domain';

describe('RescheduleCalendarItemModal Component', () => {
  const item: ContentCalendarItemProjection = {
    id: 'cal-1' as ContentCalendarItemId,
    organizationId: 'org-1' as OrganizationId,
    campaignId: 'camp-1' as CampaignId,
    campaignName: 'Campaña Navideña',
    clientId: 'cli-1',
    clientName: 'Cliente Delta',
    activationId: null,
    targetId: null,
    channel: 'meta_ads',
    provider: 'meta',
    title: 'Post de Navidad',
    contentSummary: null,
    scheduledFor: new Date('2026-12-01T12:00:00Z'),
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

  it('requires rescheduleReason before submitting', async () => {
    const handleClose = vi.fn();
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <RescheduleCalendarItemModal
        item={item}
        isOpen={true}
        onClose={handleClose}
        onSubmit={handleSubmit}
      />,
    );

    expect(screen.getByText('Reprogramar Contenido')).toBeInTheDocument();
    expect(screen.getByText('Post de Navidad')).toBeInTheDocument();

    const dateInput = screen.getByLabelText(/Nueva Fecha/i);
    fireEvent.change(dateInput, { target: { value: '2026-12-05' } });

    const submitBtn = screen.getByRole('button', { name: /Confirmar Reprogramación/i });
    fireEvent.click(submitBtn);

    // Should show error message because rescheduleReason is required
    expect(screen.getByText('Por favor especifica la nueva fecha y el motivo de reprogramación.')).toBeInTheDocument();
    expect(handleSubmit).not.toHaveBeenCalled();

    const reasonInput = screen.getByPlaceholderText('Explica por qué se reprograma la fecha...');
    fireEvent.change(reasonInput, { target: { value: 'Postergado por solicitud del cliente' } });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarItemId: 'cal-1',
          rescheduleReason: 'Postergado por solicitud del cliente',
        }),
      );
    });
  });
});
