/**
 * CreateActivationPanel — Phase 8A.3.
 *
 * Cobertura (§9 del kickoff):
 *   U1. campaña aprobada + strategist+ → muestra el botón de creación.
 *   U2. campaña aprobada + operator → NO muestra el botón (mensaje informativo, sin control mutable).
 *   U3. campaña aprobada + viewer → NO muestra ningún control ni mensaje accionable.
 *   U4. ya existe una activación no-terminal → el panel de creación no se muestra (sin duplicar el path de creación).
 *   U5. campaña NO aprobada → mensaje de estado inválido, sin botón.
 *   U6. click invoca la Server Action con el campaignId correcto y notas trimmed.
 *   U7. error del servidor (p. ej. CONFLICT por duplicado) se muestra sin romper el formulario.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockCreateAction, mockRefresh } = vi.hoisted(() => ({
  mockCreateAction: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('@/app/(protected)/campaigns/[id]/activation/actions', () => ({
  createCampaignActivationAction: mockCreateAction,
}));

import { CreateActivationPanel } from '../CreateActivationPanel';

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateAction.mockResolvedValue({ ok: true, data: { id: 'activation-1' } });
});

describe('CreateActivationPanel', () => {
  it('U1: strategist ve el botón de creación cuando la campaña está aprobada', () => {
    render(
      <CreateActivationPanel
        campaignId="campaign-1"
        campaignStatus="approved"
        userRole="strategist"
        hasNonTerminalActivation={false}
      />,
    );
    expect(screen.getByRole('button', { name: /crear activación/i })).toBeInTheDocument();
  });

  it('U2: operator NO ve el botón de creación — solo un mensaje informativo', () => {
    render(
      <CreateActivationPanel
        campaignId="campaign-1"
        campaignStatus="approved"
        userRole="operator"
        hasNonTerminalActivation={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /crear activación/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('activation-permission-disabled')).toBeInTheDocument();
  });

  it('U3: viewer no ve ningún control mutable (solo texto informativo de solo lectura, si acaso)', () => {
    render(
      <CreateActivationPanel
        campaignId="campaign-1"
        campaignStatus="approved"
        userRole="viewer"
        hasNonTerminalActivation={false}
      />,
    );
    // Ningún botón ni input — el mensaje (si aparece) es puramente informativo,
    // nunca un control mutable. La autorización real vive en el Server Action.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('U4: ya existe una activación no-terminal → strategist no ve un segundo path de creación', () => {
    render(
      <CreateActivationPanel
        campaignId="campaign-1"
        campaignStatus="approved"
        userRole="strategist"
        hasNonTerminalActivation={true}
      />,
    );
    expect(screen.queryByRole('button', { name: /crear activación/i })).not.toBeInTheDocument();
  });

  it('U5: campaña no aprobada → mensaje de estado inválido, sin botón', () => {
    render(
      <CreateActivationPanel
        campaignId="campaign-1"
        campaignStatus="draft"
        userRole="strategist"
        hasNonTerminalActivation={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /crear activación/i })).not.toBeInTheDocument();
    expect(screen.getByText(/solo se puede crear una activación/i)).toBeInTheDocument();
  });

  it('U6: click invoca la Server Action con campaignId y notas trimmed', async () => {
    render(
      <CreateActivationPanel
        campaignId="campaign-1"
        campaignStatus="approved"
        userRole="admin"
        hasNonTerminalActivation={false}
      />,
    );
    fireEvent.change(screen.getByLabelText(/notas/i), { target: { value: '  contexto operativo  ' } });
    fireEvent.click(screen.getByRole('button', { name: /crear activación/i }));

    await waitFor(() => expect(mockCreateAction).toHaveBeenCalledTimes(1));
    expect(mockCreateAction).toHaveBeenCalledWith({
      campaignId: 'campaign-1',
      notes: 'contexto operativo',
    });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it('U7: error del servidor (duplicado) se muestra sin romper el formulario', async () => {
    mockCreateAction.mockResolvedValue({
      ok: false,
      error: 'Campaign campaign-1 already has a non-terminal activation.',
      code: 'CONFLICT',
    });

    render(
      <CreateActivationPanel
        campaignId="campaign-1"
        campaignStatus="approved"
        userRole="strategist"
        hasNonTerminalActivation={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /crear activación/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/already has a non-terminal activation/i);
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
