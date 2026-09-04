import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestMetaConnectionButton } from '../TestMetaConnectionButton';
import { testMetaConnectionAction } from '@/app/(protected)/clients/[clientId]/integrations/meta/actions';

vi.mock('@/app/(protected)/clients/[clientId]/integrations/meta/actions', () => ({
  testMetaConnectionAction: vi.fn(),
}));

describe('TestMetaConnectionButton Component', () => {
  const orgId = 'f0b5ffb4-f0a9-4b97-8ee0-b233ce32d0ac';
  const clientId = 'be3397d8-3189-4c73-b064-daa46dcbd0cd';
  const integrationId = 'e46c2fc8-b450-478f-a283-15230428ea5a';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Probar conexión" button initially', () => {
    render(
      <TestMetaConnectionButton
        organizationId={orgId}
        clientId={clientId}
        clientIntegrationId={integrationId}
      />
    );

    const button = screen.getByRole('button', { name: /probar conexión con meta/i });
    expect(button).toBeDefined();
    expect(button.textContent).toContain('Probar conexión');
  });

  it('triggers testMetaConnectionAction and renders safe connection results when successful', async () => {
    vi.mocked(testMetaConnectionAction).mockResolvedValueOnce({
      success: true,
      value: {
        decryptionSucceeded: true,
        account: {
          id: 'act_906768512465553',
          name: 'Legalink Colombia',
          currency: 'COP',
          timezone_name: 'America/Bogota',
          account_status: 1,
        },
        campaignsCount: 2,
        campaigns: [
          { id: 'camp_001', name: 'Legalink Awareness 2026', status: 'ACTIVE' },
          { id: 'camp_002', name: 'Legalink Retargeting', status: 'PAUSED' },
        ],
        sampleMetrics: [
          {
            campaign_id: 'camp_001',
            date_start: '2026-08-01',
            date_stop: '2026-08-31',
            impressions: 15420,
            clicks: 380,
            spend: '450000.00',
            reach: 11200,
            account_currency: 'COP',
          },
        ],
        candidateCampaignId: 'camp_001',
      },
    });

    render(
      <TestMetaConnectionButton
        organizationId={orgId}
        clientId={clientId}
        clientIntegrationId={integrationId}
      />
    );

    const button = screen.getByRole('button', { name: /probar conexión con meta/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(testMetaConnectionAction).toHaveBeenCalledWith(
        orgId,
        clientId,
        integrationId,
        true
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Conexión con Meta verificada')).toBeDefined();
      expect(screen.getByText('Legalink Colombia')).toBeDefined();
      expect(screen.getByText('(act_906768512465553)')).toBeDefined();
      expect(screen.getByText('COP / America/Bogota')).toBeDefined();
      expect(screen.getByText('Legalink Awareness 2026')).toBeDefined();
      expect(screen.getByText('Legalink Retargeting')).toBeDefined();
      expect(screen.getByText('ACTIVE')).toBeDefined();
      expect(screen.getByText('PAUSED')).toBeDefined();
      expect(screen.getByText('15420')).toBeDefined();
      expect(screen.getByText('380')).toBeDefined();
      expect(screen.getByText('450000.00 COP')).toBeDefined();
    });

    // Can close the modal
    const closeButton = screen.getByRole('button', { name: /cerrar/i });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText('Conexión con Meta verificada')).toBeNull();
    });
  });

  it('renders error alert when action returns failure', async () => {
    vi.mocked(testMetaConnectionAction).mockResolvedValueOnce({
      success: false,
      error: 'Meta Graph API returned OAuthException (Error code: 190)',
    });

    render(
      <TestMetaConnectionButton
        organizationId={orgId}
        clientId={clientId}
        clientIntegrationId={integrationId}
      />
    );

    const button = screen.getByRole('button', { name: /probar conexión con meta/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Fallo en la prueba de conexión')).toBeDefined();
      expect(
        screen.getByText('Meta Graph API returned OAuthException (Error code: 190)')
      ).toBeDefined();
    });
  });
});
