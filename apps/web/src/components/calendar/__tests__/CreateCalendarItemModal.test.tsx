import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateCalendarItemModal } from '../CreateCalendarItemModal';

describe('CreateCalendarItemModal Component', () => {
  it('renders modal when open and submits valid form data', async () => {
    const handleClose = vi.fn();
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <CreateCalendarItemModal
        isOpen={true}
        onClose={handleClose}
        onSubmit={handleSubmit}
      />,
    );

    expect(screen.getByText('Programar Nuevo Contenido')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('UUID de la campaña'), {
      target: { value: 'camp-123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Ej: Lanzamiento Promo Instagram Feed'), {
      target: { value: 'Nuevo Post Test' },
    });

    // Fill date
    const dateInput = screen.getByLabelText(/Fecha/i);
    fireEvent.change(dateInput, { target: { value: '2026-09-10' } });

    const submitBtn = screen.getByRole('button', { name: /Guardar en Calendario/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId: 'camp-123',
          title: 'Nuevo Post Test',
        }),
      );
    });
  });
});
