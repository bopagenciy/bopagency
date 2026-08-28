import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PublicationWebhookEvidenceTable } from '../PublicationWebhookEvidenceTable';
import type { PublicationWebhookEvidenceItem } from '@bop-agency/application';

describe('PublicationWebhookEvidenceTable Component (Phase 8B.4)', () => {
  it('renders loading state', () => {
    render(<PublicationWebhookEvidenceTable evidence={[]} isLoading={true} />);
    expect(screen.getByText('Cargando evidencia de webhooks...')).toBeInTheDocument();
  });

  it('renders empty state when no evidence exists', () => {
    render(<PublicationWebhookEvidenceTable evidence={[]} isLoading={false} />);
    expect(screen.getByText(/No se ha registrado evidencia de webhook/)).toBeInTheDocument();
  });

  it('renders sanitized evidence fields and DOES NOT render raw payload or secrets', () => {
    const mockEvidence: PublicationWebhookEvidenceItem[] = [
      {
        id: 'wh-1',
        provider: 'meta',
        externalEventId: 'evt-meta-999',
        payloadHash: 'a1b2c3d4e5f678901234567890abcdef',
        status: 'processed',
        errorCode: null,
        receivedAt: new Date('2026-08-27T14:00:00Z'),
      },
    ];

    render(<PublicationWebhookEvidenceTable evidence={mockEvidence} isLoading={false} />);

    expect(screen.getByText('evt-meta-999')).toBeInTheDocument();
    expect(screen.getByText('meta')).toBeInTheDocument();
    expect(screen.getByText('processed')).toBeInTheDocument();
    expect(screen.getByText('a1b2c3d4e5f6...')).toBeInTheDocument();

    // Verify secret / raw header names are never present in DOM
    expect(screen.queryByText(/x-bop-signature/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/secret/i)).not.toBeInTheDocument();
  });
});
