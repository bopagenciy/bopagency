/**
 * CampaignActivationEntryCard — Phase 8A.3 §6 (integración en Campaign Studio).
 *
 * Cobertura:
 *   U1. campaña aprobada, sin activación → strategist+ ve el entry point de creación.
 *   U2. campaña aprobada, sin activación → viewer NO ve ningún control mutable.
 *   U3. ya existe una activación no-terminal → se muestra el link "Ver activación",
 *       nunca un segundo path de creación (incluso para strategist+).
 *   U4. campaña no aprobada y sin historial de activaciones → la sección no se renderiza.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/(protected)/campaigns/[id]/activation/actions', () => ({
  createCampaignActivationAction: vi.fn(),
}));

import { CampaignActivationEntryCard } from '../CampaignActivationEntryCard';

describe('CampaignActivationEntryCard', () => {
  it('U1: campaña aprobada sin activación → strategist ve el entry point de creación', () => {
    render(
      <CampaignActivationEntryCard
        campaignId="campaign-1"
        campaignStatus="approved"
        userRole="strategist"
        activeActivation={null}
        hasAnyActivation={false}
      />,
    );
    expect(screen.getByRole('button', { name: /crear activación/i })).toBeInTheDocument();
  });

  it('U2: campaña aprobada sin activación → viewer no ve ningún control mutable', () => {
    render(
      <CampaignActivationEntryCard
        campaignId="campaign-1"
        campaignStatus="approved"
        userRole="viewer"
        activeActivation={null}
        hasAnyActivation={false}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('U3: activación no-terminal existente → solo "Ver activación", nunca un segundo path de creación', () => {
    render(
      <CampaignActivationEntryCard
        campaignId="campaign-1"
        campaignStatus="approved"
        userRole="strategist"
        activeActivation={{ id: 'activation-1', status: 'preparing' }}
        hasAnyActivation={true}
      />,
    );
    expect(screen.getByRole('link', { name: /ver activación/i })).toHaveAttribute(
      'href',
      '/campaigns/campaign-1/activation',
    );
    expect(screen.queryByRole('button', { name: /crear activación/i })).not.toBeInTheDocument();
  });

  it('U4: campaña no aprobada y sin historial → la sección no se renderiza', () => {
    const { container } = render(
      <CampaignActivationEntryCard
        campaignId="campaign-1"
        campaignStatus="draft"
        userRole="admin"
        activeActivation={null}
        hasAnyActivation={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
