import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ManualPublishModal } from '../ManualPublishModal';

describe('ManualPublishModal Component', () => {
  it('renders modal when open and submits valid evidence', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <ManualPublishModal
        isOpen={true}
        targetId="target-1"
        channelName="manual"
        onClose={handleClose}
        onSubmit={handleSubmit}
      />
    );

    expect(screen.getByText('Confirmar Publicación Manual')).toBeDefined();

    const refInput = screen.getByPlaceholderText(/referencia externa/i);
    fireEvent.change(refInput, { target: { value: 'post-123' } });

    const submitBtn = screen.getByRole('button', { name: /confirmar publicación manual/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith({
        externalReference: 'post-123',
      });
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('validates requiring at least one evidence field', async () => {
    const handleSubmit = vi.fn();

    render(
      <ManualPublishModal
        isOpen={true}
        targetId="target-1"
        channelName="manual"
        onClose={vi.fn()}
        onSubmit={handleSubmit}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /confirmar publicación manual/i });
    fireEvent.click(submitBtn);

    expect(screen.getByText('Se requiere al menos un campo de evidencia (referencia externa o nota).')).toBeDefined();
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});
