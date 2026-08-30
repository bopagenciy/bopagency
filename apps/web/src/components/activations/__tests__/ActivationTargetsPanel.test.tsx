/**
 * ActivationTargetsPanel — Phase 8A.3.
 *
 * Cobertura (§9 del kickoff):
 *   U1. viewer NO ve ningún control mutable (ni agregar, preparar, listo, publicar, cancelar).
 *   U2. operator ve prepare/ready/publish según status pero NO ve "agregar canal" ni "cancelar".
 *   U3. strategist ve "agregar canal" y "cancelar", pero NO ve controles de operación manual salvo que también sea operator+ (jerarquía de rol).
 *   U4. estado vacío quando no hay targets.
 *   U5. "marcar publicado" (operator) invoca el Server Action con los campos correctos — nunca llama a un proveedor externo.
 *   U6. cancelar un target requiere razón no vacía antes de invocar el Server Action.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const {
  mockAddTarget,
  mockPrepare,
  mockMarkReady,
  mockMarkPublished,
  mockCancelTarget,
  mockRefresh,
} = vi.hoisted(() => ({
  mockAddTarget: vi.fn(),
  mockPrepare: vi.fn(),
  mockMarkReady: vi.fn(),
  mockMarkPublished: vi.fn(),
  mockCancelTarget: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('@/app/(protected)/campaigns/[id]/activation/actions', () => ({
  addCampaignActivationTargetAction: mockAddTarget,
  prepareActivationTargetAction: mockPrepare,
  markActivationTargetReadyAction: mockMarkReady,
  markActivationTargetPublishedAction: mockMarkPublished,
  cancelActivationTargetAction: mockCancelTarget,
}));

import { ActivationTargetsPanel, type ActivationTargetRow } from '../ActivationTargetsPanel';

const PENDING_TARGET: ActivationTargetRow = {
  id: 'target-1',
  channel: 'manual',
  provider: 'manual',
  placement: null,
  status: 'pending',
  clientIntegrationId: null,
  externalReference: null,
  publishedAt: null,
  createdAt: '2026-08-20T10:00:00.000Z',
};

const READY_TARGET: ActivationTargetRow = {
  ...PENDING_TARGET,
  id: 'target-2',
  status: 'ready',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAddTarget.mockResolvedValue({ ok: true, data: { id: 'target-new' } });
  mockPrepare.mockResolvedValue({ ok: true });
  mockMarkReady.mockResolvedValue({ ok: true });
  mockMarkPublished.mockResolvedValue({ ok: true });
  mockCancelTarget.mockResolvedValue({ ok: true });
});

describe('ActivationTargetsPanel — role gating', () => {
  it('U1: viewer no ve ningún control mutable', () => {
    render(
      <ActivationTargetsPanel
        campaignId="campaign-1"
        activationId="activation-1"
        activationTerminal={false}
        targets={[PENDING_TARGET, READY_TARGET]}
        userRole="viewer"
      />,
    );
    expect(screen.queryByRole('button', { name: /agregar canal manual/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /preparar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /marcar publicado/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^cancelar$/i })).not.toBeInTheDocument();
  });

  it('U2: operator ve "preparar" para un target pending pero NO ve "agregar canal" ni "cancelar"', () => {
    render(
      <ActivationTargetsPanel
        campaignId="campaign-1"
        activationId="activation-1"
        activationTerminal={false}
        targets={[PENDING_TARGET]}
        userRole="operator"
      />,
    );
    expect(screen.getByRole('button', { name: /preparar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /agregar canal manual/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^cancelar$/i })).not.toBeInTheDocument();
  });

  it('U3: strategist ve "agregar canal manual" y "cancelar" para un target cancelable', () => {
    render(
      <ActivationTargetsPanel
        campaignId="campaign-1"
        activationId="activation-1"
        activationTerminal={false}
        targets={[PENDING_TARGET]}
        userRole="strategist"
      />,
    );
    expect(screen.getByRole('button', { name: /agregar canal manual/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cancelar$/i })).toBeInTheDocument();
    // strategist puro (sin operator+) no debería ver "preparar" — la jerarquía
    // de roles real SIEMPRE incluye operator en strategist (ver auth/server.ts
    // ROLE_HIERARCHY), este componente confía en `userRole` ya resuelto.
  });

  it('U4: estado vacío cuando no hay targets', () => {
    render(
      <ActivationTargetsPanel
        campaignId="campaign-1"
        activationId="activation-1"
        activationTerminal={false}
        targets={[]}
        userRole="strategist"
      />,
    );
    expect(screen.getByTestId('targets-empty-state')).toBeInTheDocument();
  });

  it('U5: "marcar publicado" (operator) invoca el Server Action con los campos correctos', async () => {
    render(
      <ActivationTargetsPanel
        campaignId="campaign-1"
        activationId="activation-1"
        activationTerminal={false}
        targets={[READY_TARGET]}
        userRole="operator"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /marcar publicado/i }));
    const refInput = screen.getByPlaceholderText(/referencia externa/i);
    fireEvent.change(refInput, { target: { value: 'post-99' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar publicación manual/i }));

    await waitFor(() => expect(mockMarkPublished).toHaveBeenCalledTimes(1));
    expect(mockMarkPublished).toHaveBeenCalledWith({
      campaignId: 'campaign-1',
      targetId: 'target-2',
      externalReference: 'post-99',
      note: null,
    });
  });

  it('U6: cancelar un target requiere razón no vacía antes de invocar el Server Action', async () => {
    render(
      <ActivationTargetsPanel
        campaignId="campaign-1"
        activationId="activation-1"
        activationTerminal={false}
        targets={[PENDING_TARGET]}
        userRole="strategist"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar cancelación/i }));

    expect(await screen.findByText(/la razón de cancelación es requerida/i)).toBeInTheDocument();
    expect(mockCancelTarget).not.toHaveBeenCalled();

    const textarea = screen.getByLabelText(/razón de cancelación/i);
    fireEvent.change(textarea, { target: { value: 'Cliente canceló el canal' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar cancelación/i }));

    await waitFor(() => expect(mockCancelTarget).toHaveBeenCalledTimes(1));
    expect(mockCancelTarget).toHaveBeenCalledWith({
      campaignId: 'campaign-1',
      targetId: 'target-1',
      reason: 'Cliente canceló el canal',
    });
  });
});
