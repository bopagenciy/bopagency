import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CancelTargetModal } from '../CancelTargetModal';

describe('CancelTargetModal Component', () => {
  it('renders modal when open and submits mandatory cancellation reason', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <CancelTargetModal
        isOpen={true}
        targetId="target-1"
        channelName="manual"
        onClose={handleClose}
        onSubmit={handleSubmit}
      />
    );

    expect(screen.getByText('Cancelar Canal de Activación')).toBeDefined();

    const reasonInput = screen.getByPlaceholderText('Escriba el motivo por el cual se cancela el canal...');
    fireEvent.change(reasonInput, { target: { value: 'Cliente canceló la campaña' } });

    const submitBtn = screen.getByRole('button', { name: /confirmar cancelación/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith('Cliente canceló la campaña');
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('requires mandatory cancellation reason', async () => {
    const handleSubmit = vi.fn();

    render(
      <CancelTargetModal
        isOpen={true}
        targetId="target-1"
        channelName="manual"
        onClose={vi.fn()}
        onSubmit={handleSubmit}
      />
    );

    const reasonInput = screen.getByPlaceholderText('Escriba el motivo por el cual se cancela el canal...');
    expect(reasonInput.getAttribute('required')).toBeNull();

    const submitBtn = screen.getByRole('button', { name: /confirmar cancelación/i });
    const form = submitBtn.closest('form');
    if (form) fireEvent.submit(form);

    expect(screen.getByText('La razón de cancelación es requerida.')).toBeDefined();
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});
