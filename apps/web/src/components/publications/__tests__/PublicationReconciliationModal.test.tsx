import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PublicationReconciliationModal } from '../PublicationReconciliationModal';

describe('PublicationReconciliationModal Component (Phase 8B.4)', () => {
  const jobId = 'job-unknown-123';
  const campaignId = 'camp-123';

  it('does not render when isOpen is false', () => {
    render(
      <PublicationReconciliationModal
        isOpen={false}
        jobId={jobId}
        campaignId={campaignId}
        onClose={vi.fn()}
        onReconcile={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders modal with warning notice and requires non-empty note', async () => {
    const onReconcile = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <PublicationReconciliationModal
        isOpen={true}
        jobId={jobId}
        campaignId={campaignId}
        onClose={onClose}
        onReconcile={onReconcile}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Advertencia de Seguridad & Auditoría/)).toBeInTheDocument();

    const noteInput = screen.getByPlaceholderText(/Explique la evidencia verificada/);
    const submitBtn = screen.getByText('Confirmar Reconciliación');

    // Submit with non-whitespace note
    fireEvent.change(noteInput, { target: { value: ' Verificado en dashboard externo de Meta Ads ' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onReconcile).toHaveBeenCalledWith({
        outcome: 'published',
        note: 'Verificado en dashboard externo de Meta Ads',
        externalId: undefined,
        externalUrl: undefined,
      });
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('allows selecting "No se publicó" (not_published) outcome', async () => {
    const onReconcile = vi.fn().mockResolvedValue(undefined);

    render(
      <PublicationReconciliationModal
        isOpen={true}
        jobId={jobId}
        campaignId={campaignId}
        onClose={vi.fn()}
        onReconcile={onReconcile}
      />,
    );

    const notPublishedRadio = screen.getByLabelText(/No se publicó/);
    fireEvent.click(notPublishedRadio);

    const noteInput = screen.getByPlaceholderText(/Explique la evidencia verificada/);
    fireEvent.change(noteInput, { target: { value: 'Confirmado por soporte del proveedor que la solicitud falló' } });

    const submitBtn = screen.getByText('Confirmar Reconciliación');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onReconcile).toHaveBeenCalledWith({
        outcome: 'not_published',
        note: 'Confirmado por soporte del proveedor que la solicitud falló',
        externalId: undefined,
        externalUrl: undefined,
      });
    });
  });
});
