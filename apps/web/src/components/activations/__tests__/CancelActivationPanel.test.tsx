/**
 * CancelActivationPanel — Phase 8A.3.
 *
 * Cobertura (§9 del kickoff):
 *   U1. operator NUNCA ve el control de cancelación de la activación completa
 *       (§5: "operator: ... no activation cancellation").
 *   U2. strategist ve el control cuando `canCancel` es true (estado lo permite).
 *   U3. `canCancel=false` (p. ej. activación en `executing`/terminal) → ningún
 *       rol ve el control, ni siquiera admin/owner.
 *   U4. cancelación requiere razón no vacía y una confirmación explícita en
 *       dos pasos antes de invocar el Server Action.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockCancelActivation, mockRefresh } = vi.hoisted(() => ({
  mockCancelActivation: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('@/app/(protected)/campaigns/[id]/activation/actions', () => ({
  cancelCampaignActivationAction: mockCancelActivation,
}));

import { CancelActivationPanel } from '../CancelActivationPanel';

beforeEach(() => {
  vi.clearAllMocks();
  mockCancelActivation.mockResolvedValue({ ok: true });
});

describe('CancelActivationPanel', () => {
  it('U1: operator NUNCA ve el control de cancelación de la activación completa', () => {
    render(
      <CancelActivationPanel
        campaignId="campaign-1"
        activationId="activation-1"
        userRole="operator"
        canCancel={true}
      />,
    );
    expect(screen.queryByText(/cancelar activación/i)).not.toBeInTheDocument();
  });

  it('U2: strategist ve el control cuando el estado lo permite', () => {
    render(
      <CancelActivationPanel
        campaignId="campaign-1"
        activationId="activation-1"
        userRole="strategist"
        canCancel={true}
      />,
    );
    expect(screen.getByRole('button', { name: /cancelar activación…/i })).toBeInTheDocument();
  });

  it('U3: canCancel=false → ni siquiera admin ve el control (estado no lo permite)', () => {
    render(
      <CancelActivationPanel
        campaignId="campaign-1"
        activationId="activation-1"
        userRole="admin"
        canCancel={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /cancelar activación…/i })).not.toBeInTheDocument();
  });

  it('U4: requiere razón + confirmación en dos pasos antes de invocar el Server Action', async () => {
    render(
      <CancelActivationPanel
        campaignId="campaign-1"
        activationId="activation-1"
        userRole="admin"
        canCancel={true}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /cancelar activación…/i }));
    // Sin razón: "Continuar" debe bloquear el paso de confirmación.
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/razón de cancelación es requerida/i);
    expect(mockCancelActivation).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/razón de cancelación/i), {
      target: { value: 'El cliente pausó la campaña indefinidamente' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    expect(screen.getByText(/¿confirmas la cancelación/i)).toBeInTheDocument();
    expect(mockCancelActivation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /sí, cancelar activación/i }));

    await waitFor(() => expect(mockCancelActivation).toHaveBeenCalledTimes(1));
    expect(mockCancelActivation).toHaveBeenCalledWith({
      campaignId: 'campaign-1',
      activationId: 'activation-1',
      reason: 'El cliente pausó la campaña indefinidamente',
    });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });
});
